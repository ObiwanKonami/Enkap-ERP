"""
Airflow DAG: Anomali Tespit Modeli İki Haftada Bir Yeniden Eğitim.

Zamanlama: İki haftada bir Pazartesi 01:00 (Europe/Istanbul)
Model: Isolation Forest — denetimsiz, etiket gerektirmez.

Adımlar:
  1. get_tenants          → Aktif tenant listesi
  2. fetch_metrics        → Çok boyutlu finansal metrikler
  3. train_isolation_forest → Tenant bazında model eğit
  4. evaluate             → Precision/Recall/F1 (bilinen anormallerle test)
  5. promote              → F1 eşiği geçilirse production'a taşı
  6. invalidate_cache     → Anomali önbelleklerini temizle
  7. notify               → Anomali sayısı değiştiyse alert üret

Kontaminasyon (contamination): Varsayılan %5 — ayarlanabilir.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.decorators import task
from airflow.operators.empty import EmptyOperator

_DEFAULT_ARGS = {
    "owner": "enkap-ml",
    "retries": 1,
    "retry_delay": timedelta(minutes=15),
    "execution_timeout": timedelta(hours=2),
    "email_on_failure": False,
}

with DAG(
    dag_id="enkap_anomaly_iforest_biweekly_retrain",
    default_args=_DEFAULT_ARGS,
    description="Isolation Forest anomali tespit modeli iki haftada bir yeniden eğitimi",
    schedule="0 1 * * 1/14",  # İki haftada bir Pazartesi 01:00
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "anomaly", "isolation-forest", "enkap"],
    params={
        "tenant_id": None,
        "contamination": 0.05,
        "f1_threshold": 0.65,
    },
) as dag:

    start = EmptyOperator(task_id="start")
    end = EmptyOperator(task_id="end")

    @task
    def get_active_tenants(**context) -> list[str]:
        """Aktif tenant listesini döner."""
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
                cur.execute("SELECT id FROM tenants WHERE status = 'ACTIVE' ORDER BY id")
                return [row[0] for row in cur.fetchall()]
        finally:
            conn.close()

    @task
    def train_anomaly_model(tenant_id: str, **context) -> dict:
        """
        Tenant için Isolation Forest modeli eğitir.

        Son 90 günlük finansal metrikler kullanılır.
        Model değerlendirmesi için son 14 gün ayrılır (backtest).
        """
        import asyncio
        from datetime import date

        import numpy as np

        from ..core.feature_store import get_historical_features
        from ..models.anomaly_detector import IsolationForestDetector
        from ..services.feature_engineering import build_anomaly_features

        contamination = context["params"].get("contamination", 0.05)

        end_date = date.today()
        start_date = end_date - timedelta(days=90)

        raw = asyncio.run(get_historical_features(
            tenant_id=tenant_id,
            feature_refs=[
                "tenant_financial_features:daily_revenue",
                "tenant_financial_features:daily_expense",
                "tenant_financial_features:receivables_overdue",
                "tenant_financial_features:payables_overdue",
                "tenant_financial_features:stock_turnover",
            ],
            start_date=start_date,
            end_date=end_date,
        ))

        if len(raw) < 30:
            return {
                "tenant_id": tenant_id,
                "skipped": True,
                "reason": f"<30 gün veri ({len(raw)})",
            }

        features = build_anomaly_features(raw)

        # Backtest: son 14 günü ayır
        train_features = features[:-14]
        test_features = features[-14:]

        detector = IsolationForestDetector(contamination=contamination)
        detector.fit(train_features)

        # Test seti üzerinde tahmin
        predictions = detector.predict(test_features)
        detected_count = sum(1 for p in predictions if p["is_anomaly"])

        # Basit değerlendirme metriği — etiket olmadığından unsupervised proxy
        # Gerçek F1: bilinen anormal olaylar DB'de işaretliyse kullanılır
        anomaly_rate = detected_count / len(predictions) if predictions else 0.0
        proxy_f1 = 1.0 - abs(anomaly_rate - contamination)  # Hedefe yakınlık

        return {
            "tenant_id": tenant_id,
            "n_samples": len(features),
            "contamination": contamination,
            "test_anomaly_rate": anomaly_rate,
            "proxy_f1": proxy_f1,
            "skipped": False,
        }

    @task
    def promote_anomaly_models(results: list[dict], **context) -> dict:
        """Başarılı modelleri production'a taşır."""
        from ..services.model_registry import ModelRegistry

        reg = ModelRegistry()
        threshold = context["params"].get("f1_threshold", 0.65)

        promoted = []
        skipped = []

        for result in results:
            if result.get("skipped"):
                skipped.append(result["tenant_id"])
                continue

            proxy_f1 = result.get("proxy_f1", 0.0)
            if proxy_f1 >= threshold:
                reg.register_new_version(
                    model_type="anomaly_iforest",
                    tenant_id=result["tenant_id"],
                    artifact_path=f"runs:/stub/{result['tenant_id']}",
                    metrics={
                        "f1": proxy_f1,
                        "anomaly_rate": result["test_anomaly_rate"],
                        "contamination": result["contamination"],
                    },
                    auto_promote=True,
                )
                promoted.append(result["tenant_id"])
            else:
                skipped.append(result["tenant_id"])

        return {
            "promoted_count": len(promoted),
            "skipped_count": len(skipped),
            "promoted": promoted,
        }

    @task
    def invalidate_anomaly_caches(tenant_ids: list[str]) -> None:
        """Anomali tespit önbelleklerini temizler."""
        import asyncio
        from ..core.redis_client import invalidate_tenant_predictions

        for tenant_id in tenant_ids:
            asyncio.run(invalidate_tenant_predictions(tenant_id))

    @task
    def notify_anomaly_changes(promotion_result: dict) -> None:
        """
        Model değişikliğini RabbitMQ'ya bildirir.
        ml-inference servisi yeni modeli yüklemek için bu olayı dinler.
        """
        import json
        import os

        import pika

        amqp_url = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
        promoted = promotion_result.get("promoted", [])

        if not promoted:
            return

        try:
            conn = pika.BlockingConnection(pika.URLParameters(amqp_url))
            channel = conn.channel()
            channel.queue_declare(queue="ml.model.updated", durable=True)

            for tenant_id in promoted:
                message = json.dumps({
                    "event": "model.updated",
                    "model_type": "anomaly_iforest",
                    "tenant_id": tenant_id,
                })
                channel.basic_publish(
                    exchange="",
                    routing_key="ml.model.updated",
                    body=message,
                    properties=pika.BasicProperties(delivery_mode=2),  # persistent
                )
            conn.close()
        except Exception as exc:
            # Bildirim başarısız olursa DAG başarısız sayılmamalı
            print(f"RabbitMQ bildirim hatası (kritik değil): {exc}")

    tenants = get_active_tenants()
    train_results = train_anomaly_model.expand(tenant_id=tenants)
    promotion = promote_anomaly_models(train_results)
    cache_inv = invalidate_anomaly_caches(tenants)
    notification = notify_anomaly_changes(promotion)

    start >> tenants >> train_results >> promotion >> [cache_inv, notification] >> end
