"""
Model Drift İzleme Endpoint'leri.

GET /api/v1/drift/report/{model_type}   → Son drift raporu (Redis)
GET /api/v1/drift/status                → Tüm modeller özet durum
POST /api/v1/drift/record-prediction    → Tahmin kayıt (PSI verisi biriktirir)
"""

from __future__ import annotations

import json
import logging
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from ..core.redis_client import get_redis
from ..core.tenant_auth import TenantDep

router = APIRouter(prefix="/drift", tags=["drift"])
logger = logging.getLogger(__name__)

MODEL_TYPES = Literal["sales_xgb", "cashflow_prophet", "anomaly_iforest"]


class DriftReport(BaseModel):
    tenant_id:     str
    model_type:    str
    psi:           float
    status:        str          # 'stable' | 'warning' | 'critical'
    needs_retrain: bool
    checked_at:    str | None   = None
    baseline_mape: float | None = None
    current_mape:  float | None = None
    details:       dict         = {}


class RecordPredictionRequest(BaseModel):
    model_type:       MODEL_TYPES
    predicted_value:  float
    is_reference:     bool = False  # True → referans dağılımına ekle


class RecordPredictionResponse(BaseModel):
    recorded: bool
    queue_size: int


@router.get(
    "/report/{model_type}",
    response_model=DriftReport,
    summary="Son drift raporu",
)
async def get_drift_report(
    model_type: MODEL_TYPES,
    tenant: TenantDep,
) -> DriftReport:
    """
    Redis'teki son haftalık drift raporunu döner.
    Henüz drift kontrolü yapılmamışsa 404 döner.
    """
    redis  = await get_redis()
    key    = f"drift:report:{tenant.tenant_id}:{model_type}"
    raw    = await redis.get(key)

    if not raw:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Drift raporu bulunamadı: {model_type}. "
                   "Haftalık DAG henüz çalışmamış olabilir.",
        )

    data = json.loads(raw)
    return DriftReport(**data)


@router.get(
    "/status",
    summary="Tüm modeller drift durumu özeti",
)
async def get_drift_status(tenant: TenantDep) -> dict:
    """
    Tenant'a ait tüm model türlerinin mevcut drift durumunu döner.
    """
    redis   = await get_redis()
    summary = {}

    for model_type in ("sales_xgb", "cashflow_prophet", "anomaly_iforest"):
        key = f"drift:report:{tenant.tenant_id}:{model_type}"
        raw = await redis.get(key)

        if raw:
            data = json.loads(raw)
            summary[model_type] = {
                "psi":           data.get("psi"),
                "status":        data.get("status", "unknown"),
                "needs_retrain": data.get("needs_retrain", False),
                "checked_at":    data.get("checked_at"),
            }
        else:
            summary[model_type] = {
                "status":    "no_data",
                "psi":       None,
                "checked_at": None,
            }

    return {
        "tenant_id":  tenant.tenant_id,
        "as_of":      date.today().isoformat(),
        "models":     summary,
    }


@router.post(
    "/record-prediction",
    response_model=RecordPredictionResponse,
    summary="Tahmin değerini PSI kuyruğuna ekle",
)
async def record_prediction(
    body:   RecordPredictionRequest,
    tenant: TenantDep,
) -> RecordPredictionResponse:
    """
    Production tahmin değerlerini Redis'e kaydeder.
    Airflow DAG bu verileri PSI hesabında kullanır.

    is_reference=True → referans dağılımına ekle (model eğitimi sonrası)
    is_reference=False → production dağılımına ekle (her tahmin sonrası)

    Kuyruk boyutu: max 1000 kayıt (LTRIM ile sınırlı)
    """
    redis = await get_redis()

    queue_type = "reference" if body.is_reference else "predictions"
    key = f"drift:{queue_type}:{tenant.tenant_id}:{body.model_type}"

    await redis.rpush(key, str(body.predicted_value))
    await redis.ltrim(key, -1000, -1)      # Son 1000 kayıtı tut
    await redis.expire(key, 90 * 24 * 3600)  # 90 gün TTL

    queue_size = await redis.llen(key)

    return RecordPredictionResponse(recorded=True, queue_size=queue_size)
