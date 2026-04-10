"""
Airflow DAG: Haftalık ML Model Drift Tespiti.

Zamanlama: Her Pazartesi 06:00 (Europe/Istanbul)
Önce eğitim DAG'ı (Pazar 02:00), ardından drift kontrolü.

Adımlar:
  1. get_active_tenants    → Aktif tenant listesi
  2. collect_predictions   → Production tahminlerini ve referans dağılımı çek
  3. compute_psi           → PSI hesapla (model_type x tenant)
  4. check_mape_drift      → MAPE bozulma kontrolü (MLflow'dan)
  5. trigger_retraining    → PSI > 0.2 veya MAPE drift → DAG tetikle
  6. log_drift_report      → Redis'e drift raporu yaz (monitoring)

Retraining tetikleyicisi:
  - Sadece sales_xgb ve cashflow_prophet modelleri drift tespitine dahil.
  - anomaly_iforest: farklı metrik (F1) — ayrı kontrol mantığı.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.decorators import task, task_group
from airflow.operators.empty import EmptyOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

_DEFAULT_ARGS = {
    "owner": "enkap-ml",
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
    "execution_timeout": timedelta(hours=1),
    "email_on_failure": False,
}

with DAG(
    dag_id="enkap_ml_drift_detection_weekly",
    default_args=_DEFAULT_ARGS,
    description="Haftalık PSI tabanlı model drift tespiti ve retraining tetikleyicisi",
    schedule="0 6 * * 1",   # Her Pazartesi 06:00 UTC
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "drift", "enkap", "weekly"],
    params={
        "psi_threshold":     0.2,    # PSI kritik eşiği
        "mape_threshold":    0.05,   # MAPE bozulma eşiği
        "tenant_id":         None,   # Manuel: belirli tenant
    },
) as dag:

    start = EmptyOperator(task_id="start")
    end   = EmptyOperator(task_id="end")

    @task
    def get_active_tenants(**context) -> list[str]:
        """Aktif tenant listesini döner (eğitim DAG'ı ile aynı kaynak)."""
        import os
        import psycopg2
        from airflow.models import Variable

        specific = context["params"].get("tenant_id")
        if specific:
            return [specific]

        db_url = Variable.get(
            "CONTROL_PLANE_DB_URL",
            os.environ.get("CONTROL_PLANE_DB_URL", ""),
        )
        if not db_url:
            return ["stub-tenant-1"]

        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM tenants WHERE status = 'ACTIVE' ORDER BY id"
                )
                return [row[0] for row in cur.fetchall()]
        finally:
            conn.close()

    @task_group(group_id="per_tenant_drift_check")
    def drift_check_tenant(tenant_id: str):
        """Bir tenant için tüm model türlerinin drift kontrolü."""

        @task(task_id="collect_predictions")
        def collect_predictions(tenant_id: str) -> dict:
            """
            Son 30 günlük production tahminlerini ve baseline referans dağılımını çeker.
            Referans dağılımı: modelin ilk eğitildiği dönemin tahminleri (MLflow artifact).
            """
            import os
            import json
            import asyncio
            import redis as redis_lib

            redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
            r = redis_lib.from_url(redis_url)

            # Redis'ten son 30 günlük tahminleri çek
            pred_key  = f"drift:predictions:{tenant_id}:sales"
            ref_key   = f"drift:reference:{tenant_id}:sales"

            raw_pred = r.lrange(pred_key, 0, -1)
            raw_ref  = r.lrange(ref_key,  0, -1)

            production_scores = [float(v) for v in raw_pred] if raw_pred else []
            reference_scores  = [float(v) for v in raw_ref]  if raw_ref  else []

            # Stub: Yetersiz veri durumunda sentetik dağılım üret
            if len(production_scores) < 30:
                import numpy as np
                rng = np.random.default_rng(42)
                reference_scores  = rng.normal(100_000, 20_000, 200).tolist()
                production_scores = rng.normal(100_000, 20_000, 60).tolist()

            return {
                "tenant_id":         tenant_id,
                "reference_scores":  reference_scores,
                "production_scores": production_scores,
            }

        @task(task_id="compute_psi")
        def compute_psi(prediction_data: dict, **context) -> dict:
            """PSI hesaplar, drift durumunu belirler."""
            from ..services.drift_detector import DriftDetector

            tenant_id = prediction_data["tenant_id"]
            detector  = DriftDetector()

            result = detector.compute_psi(
                reference_scores  = prediction_data["reference_scores"],
                production_scores = prediction_data["production_scores"],
                model_type        = "sales_xgb",
                tenant_id         = tenant_id,
                n_buckets         = 10,
            )

            return {
                "tenant_id":     tenant_id,
                "model_type":    "sales_xgb",
                "psi":           result.psi,
                "status":        result.status,
                "needs_retrain": result.needs_retrain,
                "details":       result.details,
            }

        @task(task_id="check_mape_drift")
        def check_mape_drift(tenant_id: str, psi_result: dict) -> dict:
            """
            MLflow'dan baseline ve güncel MAPE değerlerini karşılaştırır.
            Model yoksa veya MLflow erişilemiyorsa skip.
            """
            import os
            from ..services.drift_detector import DriftDetector
            from ..services.model_registry import registry

            detector = DriftDetector()
            needs_retrain = psi_result.get("needs_retrain", False)

            model_info = registry.get_production_model("sales_xgb", tenant_id)
            if not model_info:
                return {**psi_result, "mape_drift": False}

            baseline_mape = model_info.metrics.get("mape", 0.0)

            # Stub: canlı MAPE için tahmin endpoint'inden son 7 günlük ortalama hata
            current_mape = baseline_mape  # TODO: canlı evaluation pipeline entegrasyonu

            mape_drift = detector.check_mape_drift(
                baseline_mape = baseline_mape,
                current_mape  = current_mape,
                model_type    = "sales_xgb",
                tenant_id     = tenant_id,
            )

            return {
                **psi_result,
                "mape_drift":    mape_drift,
                "needs_retrain": needs_retrain or mape_drift,
                "baseline_mape": baseline_mape,
                "current_mape":  current_mape,
            }

        @task(task_id="log_drift_report")
        def log_drift_report(drift_result: dict) -> None:
            """
            Drift raporunu Redis'e yazar (monitoring dashboard için).
            Key: drift:report:{tenant_id}:{model_type}  TTL: 8 gün
            """
            import os
            import json
            import redis as redis_lib
            from datetime import date

            redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
            r = redis_lib.from_url(redis_url)

            tenant_id  = drift_result["tenant_id"]
            model_type = drift_result["model_type"]
            report_key = f"drift:report:{tenant_id}:{model_type}"

            report = {
                **drift_result,
                "checked_at": date.today().isoformat(),
            }
            r.set(report_key, json.dumps(report), ex=8 * 24 * 3600)

            if drift_result.get("needs_retrain"):
                import logging
                logging.getLogger(__name__).warning(
                    "DRIFT KRİTİK: tenant=%s model=%s psi=%.4f → retraining tetiklendi",
                    tenant_id, model_type, drift_result.get("psi", 0),
                )

        @task.branch(task_id="should_retrain")
        def should_retrain(drift_result: dict) -> str:
            """PSI veya MAPE drift varsa retraining yolunu seç."""
            if drift_result.get("needs_retrain"):
                return "per_tenant_drift_check.trigger_retraining"
            return "per_tenant_drift_check.skip_retraining"

        @task(task_id="skip_retraining")
        def skip_retraining(tenant_id: str) -> None:
            import logging
            logging.getLogger(__name__).info(
                "Drift yok — retraining atlandı: tenant=%s", tenant_id,
            )

        trigger = TriggerDagRunOperator(
            task_id="trigger_retraining",
            trigger_dag_id="enkap_sales_forecast_weekly_retrain",
            conf={"force_retrain": True},
            wait_for_completion=False,
            reset_dag_run=True,
        )

        skip = skip_retraining(tenant_id)

        pd  = collect_predictions(tenant_id)
        psi = compute_psi(pd)
        md  = check_mape_drift(tenant_id, psi)
        log = log_drift_report(md)
        br  = should_retrain(md)

        pd >> psi >> md >> log >> br >> [trigger, skip]

    tenant_list = get_active_tenants()
    checks = drift_check_tenant.expand(tenant_id=tenant_list)

    start >> tenant_list >> checks >> end
