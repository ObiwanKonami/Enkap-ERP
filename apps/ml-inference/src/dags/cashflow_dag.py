"""
Airflow DAG: Nakit Akışı Prophet Modeli Aylık Yeniden Eğitim.

Zamanlama: Her ayın 1'i 03:00 (Europe/Istanbul)
Gereksinimleri: ≥ 180 gün tarihsel nakit akışı verisi.

Adımlar:
  1. active_tenants     → Aktif ve ≥180 gün verisi olan tenant'lar
  2. fetch_cashflow     → Feast'ten giriş/çıkış verilerini çek
  3. train_prophet      → İnflow ve outflow için ayrı Prophet modeli eğit
  4. backtest           → Son 30 günlük backtest (MAPE hesapla)
  5. promote            → Eşik geçilirse production'a taşı
  6. invalidate_cache   → Redis nakit akışı önbelleklerini temizle

Not: Satış DAG'ından bağımsız — aylık döngüde daha tutarlı trend yakalanır.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.decorators import task
from airflow.operators.empty import EmptyOperator

_DEFAULT_ARGS = {
    "owner": "enkap-ml",
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
    "execution_timeout": timedelta(hours=3),
    "email_on_failure": False,
}

with DAG(
    dag_id="enkap_cashflow_prophet_monthly_retrain",
    default_args=_DEFAULT_ARGS,
    description="Prophet nakit akışı modeli aylık yeniden eğitimi",
    schedule="0 3 1 * *",  # Her ayın 1'i 03:00
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "cashflow", "prophet", "enkap", "monthly"],
    params={
        "tenant_id": None,
        "mape_threshold": 0.20,
    },
) as dag:

    start = EmptyOperator(task_id="start")
    end = EmptyOperator(task_id="end")

    @task
    def get_eligible_tenants(**context) -> list[str]:
        """≥180 gün nakit akışı verisi olan aktif tenant'ları döner."""
        import os
        import psycopg2
        from airflow.models import Variable

        specific = context["params"].get("tenant_id")
        if specific:
            return [specific]

        db_url = Variable.get("CONTROL_PLANE_DB_URL", os.environ.get("CONTROL_PLANE_DB_URL", ""))
        if not db_url:
            return ["stub-tenant-1"]

        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                # En az 180 günden beri aktif olan tenant'lar
                cur.execute(
                    """
                    SELECT id FROM tenants
                    WHERE status = 'ACTIVE'
                    AND created_at <= NOW() - INTERVAL '180 days'
                    ORDER BY id
                    """
                )
                return [row[0] for row in cur.fetchall()]
        finally:
            conn.close()

    @task
    def fetch_and_train_prophet(tenant_id: str, **context) -> dict:
        """
        Tenant için nakit akışı verisi çeker ve Prophet modellerini eğitir.
        Inflow ve outflow için ayrı modeller eğitilir.
        """
        import asyncio
        from datetime import date

        from ..core.feature_store import get_historical_features
        from ..models.cashflow_forecast import ProphetCashflowForecaster
        from ..services.feature_engineering import build_cashflow_features

        end_date = date.today()
        start_date = end_date - timedelta(days=540)

        raw = asyncio.run(get_historical_features(
            tenant_id=tenant_id,
            feature_refs=["tenant_financial_features:daily_inflow", "tenant_financial_features:daily_outflow"],
            start_date=start_date,
            end_date=end_date,
        ))

        if len(raw) < 180:
            return {"tenant_id": tenant_id, "skipped": True, "reason": f"<180 gün ({len(raw)})"}

        features = build_cashflow_features(raw)

        # Backtest: son 30 günü ayır
        train = features[:-30]
        test = features[-30:]

        forecaster = ProphetCashflowForecaster()
        forecaster.fit(train)
        predictions = forecaster.predict(train, horizon_days=30)

        # MAPE hesapla (net nakit için)
        import numpy as np
        actual_nets = [t["net"] for t in test]
        predicted_nets = [p["net"] for p in predictions[:len(actual_nets)]]
        mape = float(np.mean(
            np.abs((np.array(actual_nets) - np.array(predicted_nets)) / (np.abs(actual_nets) + 1e-6))
        ))

        return {
            "tenant_id": tenant_id,
            "n_samples": len(features),
            "mape": mape,
            "skipped": False,
        }

    @task
    def promote_cashflow_models(results: list[dict], **context) -> None:
        """Başarılı modelleri production'a taşır."""
        from ..services.model_registry import ModelRegistry

        reg = ModelRegistry()
        threshold = context["params"].get("mape_threshold", 0.20)

        for result in results:
            if result.get("skipped"):
                continue
            mape = result.get("mape", 1.0)
            if mape <= threshold:
                reg.register_new_version(
                    model_type="cashflow_prophet",
                    tenant_id=result["tenant_id"],
                    artifact_path=f"runs:/stub/{result['tenant_id']}",
                    metrics={"mape": mape},
                    auto_promote=True,
                )

    @task
    def invalidate_cashflow_caches(tenant_ids: list[str]) -> dict:
        """Tüm tenant'ların nakit akışı tahmin önbelleklerini temizler."""
        import asyncio
        from ..core.redis_client import cache_delete

        total = 0
        for tid in tenant_ids:
            asyncio.run(cache_delete(f"pred:{tid}:cashflow:*"))
            total += 1
        return {"invalidated_tenants": total}

    tenants = get_eligible_tenants()
    train_results = fetch_and_train_prophet.expand(tenant_id=tenants)
    promote = promote_cashflow_models(train_results)
    invalidate = invalidate_cashflow_caches(tenants)

    start >> tenants >> train_results >> promote >> invalidate >> end
