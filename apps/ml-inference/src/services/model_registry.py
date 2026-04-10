"""
MLflow Model Registry İstemcisi.

Her tenant için aktif model versiyonlarını yönetir.
Model versiyonlama stratejisi:
  - Model adı: enkap_{model_type}_{tenant_id}
    Örnek: enkap_sales_xgb_abc123, enkap_cashflow_prophet_abc123
  - Stage: None → Staging → Production → Archived
  - Her Airflow eğitim DAG'ı yeni versiyon oluşturur, Staging'e yükler
  - Otomatik onay: validation metrik eşiği geçilirse Production'a taşır

MLflow Tracking URI: MLFLOW_TRACKING_URI env değişkeni.

TODO: Gerçek MLflow entegrasyonu — şu an stub döner.
"""

import logging
import os
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

_MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://mlflow:5000")
_USE_STUB = os.environ.get("MLFLOW_USE_STUB", "true").lower() == "true"

try:
    import mlflow
    _MLFLOW_AVAILABLE = True
except ImportError:
    _MLFLOW_AVAILABLE = False
    logger.warning("mlflow kurulu değil — stub model registry kullanılacak")


@dataclass
class ModelInfo:
    name: str
    version: str
    stage: str          # "Production" | "Staging" | "None"
    artifact_uri: str   # MLflow artifact yolu
    metrics: dict[str, float]


class ModelRegistry:
    """
    MLflow model registry wrapper.
    Uygulama genelinde singleton kullanılır (FastAPI lifespan'da init edilir).
    """

    def __init__(self):
        self._client: Any = None
        if _MLFLOW_AVAILABLE and not _USE_STUB:
            try:
                mlflow.set_tracking_uri(_MLFLOW_URI)
                self._client = mlflow.MlflowClient()
                logger.info("MLflow istemcisi bağlandı: %s", _MLFLOW_URI)
            except Exception as exc:
                logger.error("MLflow bağlantı hatası: %s", exc)

    def get_production_model(self, model_type: str, tenant_id: str) -> ModelInfo | None:
        """
        Bir tenant için production'daki aktif modeli döner.

        model_type: 'sales_xgb' | 'cashflow_prophet' | 'anomaly_iforest'
        """
        model_name = f"enkap_{model_type}_{tenant_id.replace('-', '')}"

        if _USE_STUB or not self._client:
            return self._stub_model_info(model_name, model_type)

        try:
            versions = self._client.get_latest_versions(model_name, stages=["Production"])
            if not versions:
                logger.warning("Production modeli bulunamadı: %s", model_name)
                return None

            v = versions[0]
            return ModelInfo(
                name=model_name,
                version=v.version,
                stage=v.current_stage,
                artifact_uri=v.source,
                metrics=self._get_run_metrics(v.run_id),
            )
        except Exception as exc:
            logger.error("Model yükleme hatası (%s): %s", model_name, exc)
            return None

    def register_new_version(
        self,
        model_type: str,
        tenant_id: str,
        artifact_path: str,
        metrics: dict[str, float],
        auto_promote: bool = True,
    ) -> ModelInfo | None:
        """
        Yeni eğitilen modeli registry'ye kaydeder.
        Validation metrikler eşiği geçerse otomatik Production'a taşır.

        Airflow DAG'larından çağrılır.
        """
        model_name = f"enkap_{model_type}_{tenant_id.replace('-', '')}"

        if _USE_STUB or not self._client:
            logger.info("[STUB] Model kaydedildi: %s v999", model_name)
            return self._stub_model_info(model_name, model_type)

        try:
            # Yeni versiyon oluştur
            result = mlflow.register_model(artifact_path, model_name)
            version = result.version

            # Staging'e taşı
            self._client.transition_model_version_stage(
                name=model_name, version=version, stage="Staging"
            )

            # Otomatik onay mantığı
            if auto_promote and self._passes_validation(model_type, metrics):
                self._client.transition_model_version_stage(
                    name=model_name, version=version, stage="Production"
                )
                logger.info("Model otomatik Production'a taşındı: %s v%s", model_name, version)

            return ModelInfo(
                name=model_name,
                version=str(version),
                stage="Production" if auto_promote else "Staging",
                artifact_uri=artifact_path,
                metrics=metrics,
            )

        except Exception as exc:
            logger.error("Model kayıt hatası (%s): %s", model_name, exc)
            return None

    def _passes_validation(self, model_type: str, metrics: dict[str, float]) -> bool:
        """
        Model kalite eşiklerini kontrol eder.
        Eşikler iş gereksinimlerine göre ayarlanır.
        """
        thresholds = {
            "sales_xgb": {"mape": 0.15},       # MAPE < %15
            "cashflow_prophet": {"mape": 0.20}, # MAPE < %20
            "anomaly_iforest": {"f1": 0.70},    # F1 > 0.70
        }
        rules = thresholds.get(model_type, {})

        for metric, threshold in rules.items():
            actual = metrics.get(metric, 1.0)
            if metric == "mape" and actual > threshold:
                logger.warning("Model eşik geçilemedi: %s %s=%.3f > %.3f", model_type, metric, actual, threshold)
                return False
            if metric == "f1" and actual < threshold:
                logger.warning("Model eşik geçilemedi: %s %s=%.3f < %.3f", model_type, metric, actual, threshold)
                return False

        return True

    def _get_run_metrics(self, run_id: str) -> dict[str, float]:
        if not self._client:
            return {}
        try:
            run = self._client.get_run(run_id)
            return dict(run.data.metrics)
        except Exception:
            return {}

    def _stub_model_info(self, model_name: str, model_type: str) -> ModelInfo:
        stub_metrics = {
            "sales_xgb": {"mape": 0.08, "rmse": 12500.0},
            "cashflow_prophet": {"mape": 0.12, "mae": 8000.0},
            "anomaly_iforest": {"f1": 0.82, "precision": 0.79, "recall": 0.85},
        }
        return ModelInfo(
            name=model_name,
            version="stub-1",
            stage="Production",
            artifact_uri=f"file:///tmp/stub_models/{model_name}",
            metrics=stub_metrics.get(model_type, {}),
        )


# Singleton — FastAPI startup'ta init edilir
registry = ModelRegistry()
