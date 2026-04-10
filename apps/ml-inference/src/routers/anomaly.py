"""
Anomali tespiti endpoint'leri.

POST /api/v1/anomaly/detect    → Finansal anomali tespiti (Isolation Forest)
GET  /api/v1/anomaly/summary   → Son 30 günün anomali özeti
"""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status

from ..core.feature_store import get_historical_features
from ..core.redis_client import cache_get, cache_set, make_cache_key
from ..core.tenant_auth import TenantDep, require_ml_feature
from ..models.anomaly_detector import IsolationForestDetector, METRIC_LABELS_TR
from ..models.schemas import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    AnomalyRecord,
    ShapFeatureContribution,
)
from ..services.feature_engineering import build_anomaly_features
from ..services.model_registry import registry
from ..services.shap_explainer import ShapExplainer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/detect", response_model=AnomalyDetectionResponse)
async def detect_anomalies(
    request: AnomalyDetectionRequest,
    tenant: TenantDep,
) -> AnomalyDetectionResponse:
    """
    Belirtilen dönem için finansal anomali tespiti.

    Isolation Forest modeli:
      - Denetimsiz öğrenme — etiket gerektirmez
      - contamination = sensitivity parametresi (varsayılan %5)
      - Her tenant için ayrı model (MLflow registry'de)

    SHAP açıklaması: Her anomali için hangi metriğin baskın olduğu gösterilir.
    """
    # Business veya Enterprise plan kontrolü
    require_ml_feature(tenant)

    # Tarih aralığı doğrulaması
    if request.end_date < request.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date, start_date'den önce olamaz",
        )

    max_days = 365
    if (request.end_date - request.start_date).days > max_days:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maksimum sorgu aralığı {max_days} gündür",
        )

    # Önbellek
    cache_params = {
        "start": request.start_date.isoformat(),
        "end": request.end_date.isoformat(),
        "sensitivity": str(request.sensitivity),
    }
    cache_key = make_cache_key(tenant.tenant_id, "anomaly", cache_params)
    cached = await cache_get(cache_key)
    if cached:
        result = AnomalyDetectionResponse(**cached)
        result.cached = True
        return result

    # Ham veriyi çek
    raw_data = await get_historical_features(
        tenant_id=tenant.tenant_id,
        feature_refs=[
            "tenant_financial_features:daily_revenue",
            "tenant_financial_features:daily_expense",
            "tenant_financial_features:receivables_overdue",
        ],
        start_date=request.start_date,
        end_date=request.end_date,
    )

    if len(raw_data) < 7:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Anomali tespiti için en az 7 günlük veri gerekli",
        )

    # Özellik mühendisliği
    features = build_anomaly_features(raw_data)

    # Model yükle veya yeni eğit
    model_info = registry.get_production_model("anomaly_iforest", tenant.tenant_id)
    detector = IsolationForestDetector(contamination=request.sensitivity)

    # Eğer eğitilmiş model yoksa veriyi kullanarak anlık eğit
    if not model_info or model_info.version == "stub-1":
        detector.fit(features)

    predictions = detector.predict(features)

    # Anomali kayıtları oluştur
    anomaly_records: list[AnomalyRecord] = []
    anomaly_feature_names = [k for k in features[0].keys() if k != "ds"] if features else []

    for pred in predictions:
        if not pred["is_anomaly"]:
            continue

        metrics = pred.get("metrics", {})
        # Referans aralığı için tüm değerlerin basit istatistikleri
        all_values = {
            field: [f.get(field, 0.0) for f in features]
            for field in anomaly_feature_names
        }

        # Her anomali için dominant metriği bul
        dominant_metric = max(
            metrics.keys(),
            key=lambda m: abs(metrics.get(m, 0)),
            default="daily_revenue",
        )
        dominant_value = metrics.get(dominant_metric, 0.0)

        import numpy as np
        field_values = all_values.get(dominant_metric, [0.0])
        expected_lower = float(np.percentile(field_values, 10)) if field_values else 0.0
        expected_upper = float(np.percentile(field_values, 90)) if field_values else 0.0

        # SHAP açıklaması
        shap_contributions = None
        if request.include_shap:
            explainer = ShapExplainer(model=None)
            raw_shap = explainer.explain(
                __import__("numpy").array([[metrics.get(f, 0.0) for f in anomaly_feature_names]]),
                anomaly_feature_names,
                top_n=4,
            )
            shap_contributions = [
                ShapFeatureContribution(**s) for s in raw_shap
            ]

        anomaly_records.append(
            AnomalyRecord(
                date=date.fromisoformat(pred["ds"]),
                metric=METRIC_LABELS_TR.get(dominant_metric, dominant_metric),
                actual_value=round(dominant_value, 2),
                expected_range_lower=round(expected_lower, 2),
                expected_range_upper=round(expected_upper, 2),
                anomaly_score=round(pred["score"], 4),
                severity=pred["severity"],
                shap_explanation=shap_contributions,
            )
        )

    total = len(predictions)
    anomaly_count = len(anomaly_records)

    response = AnomalyDetectionResponse(
        tenant_id=tenant.tenant_id,
        period_start=request.start_date,
        period_end=request.end_date,
        total_records_analyzed=total,
        anomaly_count=anomaly_count,
        anomaly_rate=round(anomaly_count / total, 4) if total > 0 else 0.0,
        anomalies=anomaly_records,
        model_version=model_info.version if model_info else "ephemeral",
        cached=False,
    )

    # 30 dakika önbellek (anomali tespiti daha sık değişir)
    await cache_set(cache_key, response.model_dump(), ttl_seconds=1800)
    return response


@router.get("/summary")
async def anomaly_summary(tenant: TenantDep) -> dict:
    """
    Son 30 günün anomali özeti — Dashboard widget için.
    """
    end_date = date.today()
    start_date = end_date - timedelta(days=30)

    cache_key = make_cache_key(tenant.tenant_id, "anomaly_summary", {"period": "30d"})
    cached = await cache_get(cache_key)
    if cached:
        return {**cached, "cached": True}

    # Kısa özet — tam detect endpoint'ini çağır
    request = AnomalyDetectionRequest(
        start_date=start_date,
        end_date=end_date,
        sensitivity=0.05,
        include_shap=False,
    )

    # Basit özet için detect'i yeniden kullan
    # Gerçek uygulamada ayrı hafif endpoint olabilir
    full_result = await detect_anomalies(request, tenant)

    severity_counts = {"yüksek": 0, "orta": 0, "düşük": 0}
    for a in full_result.anomalies:
        severity_counts[a.severity] = severity_counts.get(a.severity, 0) + 1

    summary = {
        "tenant_id": tenant.tenant_id,
        "period_days": 30,
        "total_analyzed": full_result.total_records_analyzed,
        "anomaly_count": full_result.anomaly_count,
        "anomaly_rate": full_result.anomaly_rate,
        "by_severity": severity_counts,
        "latest_anomaly_date": (
            full_result.anomalies[-1].date.isoformat() if full_result.anomalies else None
        ),
        "cached": False,
    }

    await cache_set(cache_key, summary, ttl_seconds=3600)
    return summary
