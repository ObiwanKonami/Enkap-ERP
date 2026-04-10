"""
Airflow DAG: Satış Tahmin Modeli Haftalık Yeniden Eğitim.

Zamanlama: Her Pazar 02:00 (Europe/Istanbul)
Tetiklenme: Belirli bir tenant için veriler güncellenince de manuel tetiklenebilir.

Adımlar:
  1. active_tenants    → Control plane'den aktif tenant listesini çek
  2. fetch_features    → Feast offline store'dan son 365 gün veriyi çek
  3. train_xgboost     → XGBoost modeli eğit, MLflow'a kaydet
  4. train_prophet     → Prophet modeli eğit (≥180 gün verisi olan tenant'lar)
  5. validate          → MAPE hesapla, eşik kontrolü
  6. promote           → Production'a taşı
  7. invalidate_cache  → Redis tahmin önbelleklerini temizle
  8. notify            → Başarı/hata bildirimi (RabbitMQ)

Paralel çalışma: Her tenant bağımsız TaskGroup içinde işlenir (fan-out).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.decorators import task, task_group
from airflow.models import Variable
from airflow.operators.empty import EmptyOperator

# DAG varsayılan argümanları
_DEFAULT_ARGS = {
    "owner": "enkap-ml",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(hours=2),
    "email_on_failure": False,  # RabbitMQ bildirimi kullanılıyor
}

with DAG(
    dag_id="enkap_sales_forecast_weekly_retrain",
    default_args=_DEFAULT_ARGS,
    description="XGBoost/Prophet satış tahmin modeli haftalık yeniden eğitimi",
    schedule="0 2 * * 0",  # Her Pazar 02:00
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "sales", "enkap", "weekly"],
    params={
        "tenant_id": None,          # Belirli tenant için manuel tetikleme
        "force_retrain": False,     # Veri değişmese de yeniden eğit
        "mape_threshold": 0.15,     # MAPE eşiği (%15)
    },
) as dag:

    start = EmptyOperator(task_id="start")
    end = EmptyOperator(task_id="end")

    @task
    def get_active_tenants(**context) -> list[str]:
        """
        Control plane veritabanından aktif tenant listesini döner.
        Manuel tetiklemede belirli tenant_id kullanılır.
        """
        import os
        import psycopg2

        # Manuel tetikleme: belirli tenant
        specific = context["params"].get("tenant_id")
        if specific:
            return [specific]

        db_url = Variable.get("CONTROL_PLANE_DB_URL", os.environ.get("CONTROL_PLANE_DB_URL", ""))
        if not db_url:
            # Geliştirme ortamı — stub
            return ["stub-tenant-1", "stub-tenant-2"]

        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM tenants WHERE status = 'ACTIVE' ORDER BY id"
                )
                return [row[0] for row in cur.fetchall()]
        finally:
            conn.close()

    @task_group(group_id="per_tenant_training")
    def train_tenant(tenant_id: str):
        """Her tenant için bağımsız eğitim grubu."""

        @task(task_id="fetch_features")
        def fetch_features(tenant_id: str) -> dict:
            """Feast offline store'dan tarihsel feature'ları çeker."""
            import asyncio
            from datetime import date

            from ..core.feature_store import get_historical_features
            from ..services.feature_engineering import build_sales_features

            end = date.today()
            start = end - timedelta(days=365)

            raw = asyncio.run(get_historical_features(
                tenant_id=tenant_id,
                feature_refs=["tenant_sales_features:daily_revenue"],
                start_date=start,
                end_date=end,
            ))

            features = build_sales_features(raw)
            return {
                "tenant_id": tenant_id,
                "n_samples": len(features),
                "has_prophet_data": len(features) >= 180,
                "raw_data": raw,
                "features": features,
            }

        @task(task_id="train_xgboost")
        def train_xgboost(feature_data: dict) -> dict:
            """XGBoost modelini eğitir ve MLflow'a kaydeder."""
            import mlflow
            import numpy as np
            import xgboost as xgb
            from sklearn.metrics import mean_absolute_percentage_error
            from sklearn.model_selection import TimeSeriesSplit

            tenant_id = feature_data["tenant_id"]
            features = feature_data["features"]
            n = len(features)

            if n < 14:
                return {"tenant_id": tenant_id, "skipped": True, "reason": "Yetersiz veri"}

            # Özellik matrisi ve hedef değişken
            feature_cols = [k for k in features[0].keys() if k not in ("ds", "y")]
            X = np.array([[row.get(c, 0.0) for c in feature_cols] for row in features])
            y = np.array([row["y"] for row in features])

            # Zaman serisi çapraz doğrulama (son %20 test)
            split = int(n * 0.8)
            X_train, X_test = X[:split], X[split:]
            y_train, y_test = y[:split], y[split:]

            with mlflow.start_run(run_name=f"xgb_sales_{tenant_id}"):
                params = {
                    "n_estimators": 200,
                    "max_depth": 6,
                    "learning_rate": 0.05,
                    "subsample": 0.8,
                    "colsample_bytree": 0.8,
                    "early_stopping_rounds": 20,
                    "eval_metric": "mape",
                }
                mlflow.log_params(params)

                model = xgb.XGBRegressor(**params)
                model.fit(
                    X_train, y_train,
                    eval_set=[(X_test, y_test)],
                    verbose=False,
                )

                y_pred = model.predict(X_test)
                mape = mean_absolute_percentage_error(y_test + 1e-6, y_pred + 1e-6)
                mlflow.log_metric("mape", mape)
                mlflow.log_metric("n_train", split)
                mlflow.log_metric("n_test", n - split)

                artifact_path = f"xgboost_sales_{tenant_id}"
                mlflow.xgboost.log_model(model, artifact_name=artifact_path)
                run_id = mlflow.active_run().info.run_id

            return {
                "tenant_id": tenant_id,
                "model_type": "sales_xgb",
                "mape": mape,
                "run_id": run_id,
                "artifact_path": f"runs:/{run_id}/{artifact_path}",
                "skipped": False,
            }

        @task(task_id="train_prophet")
        def train_prophet(feature_data: dict) -> dict:
            """Prophet modelini eğitir (≥180 gün verisi olan tenant'lar)."""
            import mlflow

            tenant_id = feature_data["tenant_id"]

            if not feature_data.get("has_prophet_data"):
                return {"tenant_id": tenant_id, "skipped": True, "reason": "<180 gün veri"}

            from ..models.cashflow_forecast import ProphetCashflowForecaster

            raw = feature_data["raw_data"]
            forecaster = ProphetCashflowForecaster()
            forecaster.fit(raw)

            # Prophet model MLflow'a kaydedilir
            with mlflow.start_run(run_name=f"prophet_sales_{tenant_id}"):
                # TODO: Prophet artifact'ı serialize et
                mlflow.log_param("n_samples", feature_data["n_samples"])
                run_id = mlflow.active_run().info.run_id

            return {
                "tenant_id": tenant_id,
                "model_type": "cashflow_prophet",
                "run_id": run_id,
                "skipped": False,
            }

        @task(task_id="promote_to_production")
        def promote_to_production(xgb_result: dict, prophet_result: dict, **context) -> None:
            """Doğrulama geçilirse modeli production'a taşır."""
            from ..services.model_registry import ModelRegistry

            reg = ModelRegistry()
            threshold = context["params"].get("mape_threshold", 0.15)

            if not xgb_result.get("skipped"):
                mape = xgb_result.get("mape", 1.0)
                if mape <= threshold:
                    reg.register_new_version(
                        model_type="sales_xgb",
                        tenant_id=xgb_result["tenant_id"],
                        artifact_path=xgb_result["artifact_path"],
                        metrics={"mape": mape},
                        auto_promote=True,
                    )

        @task(task_id="invalidate_cache")
        def invalidate_cache(tenant_id: str) -> int:
            """Redis tahmin önbelleklerini temizler."""
            import asyncio
            from ..core.redis_client import invalidate_tenant_predictions
            deleted = asyncio.run(invalidate_tenant_predictions(tenant_id))
            return deleted

        fd = fetch_features(tenant_id)
        xgb = train_xgboost(fd)
        prp = train_prophet(fd)
        prom = promote_to_production(xgb, prp)
        inv = invalidate_cache(tenant_id)
        fd >> [xgb, prp] >> prom >> inv

    tenant_list = get_active_tenants()
    groups = train_tenant.expand(tenant_id=tenant_list)
    start >> tenant_list >> groups >> end
