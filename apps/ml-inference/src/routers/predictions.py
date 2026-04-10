"""
Tahmin endpoint'leri.

GET /api/v1/predictions/sales       → Satış tahmini (XGBoost / Prophet)
GET /api/v1/predictions/cashflow    → Nakit akışı tahmini (Prophet)

Model seçim mantığı (satış tahmini):
  Tarihsel veri < 90 gün  → XGBoost
  Tarihsel veri ≥ 180 gün → Prophet
  Arada                   → XGBoost (Prophet henüz güvenilir değil)
"""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status

from ..core.feature_store import get_historical_features
from ..core.redis_client import cache_get, cache_set, make_cache_key
from ..core.tenant_auth import TenantDep, require_ml_feature
from ..models.cashflow_forecast import ProphetCashflowForecaster
from ..models.sales_forecast import XGBoostSalesForecaster
from ..models.schemas import (
    CashflowForecastRequest,
    CashflowForecastResponse,
    CashflowPoint,
    ConfidenceInterval,
    DailyForecastPoint,
    SalesForecastRequest,
    SalesForecastResponse,
)
from ..services.feature_engineering import build_cashflow_features, build_sales_features
from ..services.model_registry import registry
from ..services.shap_explainer import ShapExplainer

logger = logging.getLogger(__name__)
router = APIRouter()

# Ufuk günleri eşlemesi
_HORIZON_DAYS = {
    "7d": 7, "14d": 14, "30d": 30, "90d": 90, "180d": 180,
}

# 90 gün: XGBoost, 180+ gün: Prophet
_PROPHET_MIN_DAYS = 180
_XGBOOST_MIN_DAYS = 14


@router.post("/sales", response_model=SalesForecastResponse)
async def predict_sales(
    request: SalesForecastRequest,
    tenant: TenantDep,
) -> SalesForecastResponse:
    """
    Satış tahmini.

    Önbellekleme: Aynı tenant + parametre kombinasyonu 1 saat önbelleklenir.
    SHAP: include_shap=True ise yanıt süresi ~500ms artar.
    """
    # Business veya Enterprise plan kontrolü
    require_ml_feature(tenant)

    horizon_days = _HORIZON_DAYS[request.horizon]

    # Önbellek kontrolü
    cache_params = {
        "horizon": request.horizon,
        "product_id": request.product_id or "",
        "category_id": request.category_id or "",
        "include_shap": str(request.include_shap),
    }
    cache_key = make_cache_key(tenant.tenant_id, "sales", cache_params)
    cached = await cache_get(cache_key)
    if cached:
        result = SalesForecastResponse(**cached)
        result.cached = True
        return result

    # Tarihsel veri çek — 365 gün
    end_date = date.today()
    start_date = end_date - timedelta(days=365)
    raw_data = await get_historical_features(
        tenant_id=tenant.tenant_id,
        feature_refs=["tenant_sales_features:daily_revenue"],
        start_date=start_date,
        end_date=end_date,
    )

    if len(raw_data) < _XGBOOST_MIN_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Yetersiz tarihsel veri: en az {_XGBOOST_MIN_DAYS} gün gerekli, "
                   f"mevcut {len(raw_data)} gün",
        )

    # Model seçimi
    use_prophet = len(raw_data) >= _PROPHET_MIN_DAYS
    model_used = "prophet" if use_prophet else "xgboost"

    # Özellik mühendisliği
    features = build_sales_features(raw_data)

    # Tahmin
    if use_prophet:
        forecaster = ProphetCashflowForecaster()
        forecaster.fit(raw_data)
        # Prophet cashflow yerine sales için adapter — y sütunu
        prophet_data = [{"ds": r["ds"], "inflow": r["y"], "outflow": 0} for r in raw_data]
        raw_forecast = forecaster.predict(prophet_data, horizon_days)
        daily_points = [
            DailyForecastPoint(
                ds=date.fromisoformat(p["ds"]),
                yhat=p["inflow"],
                yhat_lower=p["net_lower"] + p["inflow"],
                yhat_upper=p["net_upper"] + p["inflow"],
            )
            for p in raw_forecast
        ]
    else:
        model_info = registry.get_production_model("sales_xgb", tenant.tenant_id)
        artifact_path = model_info.artifact_uri if model_info else None
        xgb_forecaster = XGBoostSalesForecaster(artifact_path)
        raw_forecast = xgb_forecaster.predict(raw_data, horizon_days)
        daily_points = [
            DailyForecastPoint(
                ds=date.fromisoformat(p["ds"]),
                yhat=p["yhat"],
                yhat_lower=p["yhat_lower"],
                yhat_upper=p["yhat_upper"],
                trend=p.get("trend"),
                weekly_seasonality=p.get("weekly_seasonality"),
            )
            for p in raw_forecast
        ]

    total_revenue = sum(p.yhat for p in daily_points)
    ci_lower = sum(p.yhat_lower for p in daily_points)
    ci_upper = sum(p.yhat_upper for p in daily_points)

    # SHAP açıklaması
    shap_explanation = None
    if request.include_shap:
        shap_explanation = _generate_sales_shap(features, tenant.tenant_id)

    response = SalesForecastResponse(
        tenant_id=tenant.tenant_id,
        model_used=model_used,
        horizon_days=horizon_days,
        forecast_date=date.today(),
        total_predicted_revenue=round(total_revenue, 2),
        confidence_interval=ConfidenceInterval(lower=round(ci_lower, 2), upper=round(ci_upper, 2)),
        daily_forecast=daily_points,
        shap_explanation=shap_explanation,
        cached=False,
    )

    # Önbelleğe yaz (SHAP olmayan versiyonu sakla)
    await cache_set(cache_key, response.model_dump(), ttl_seconds=3600)
    return response


@router.post("/cashflow", response_model=CashflowForecastResponse)
async def predict_cashflow(
    request: CashflowForecastRequest,
    tenant: TenantDep,
) -> CashflowForecastResponse:
    """
    Nakit akışı tahmini (Prophet).
    Minimum 180 gün tarihsel veri gerektirir.
    """
    horizon_days = _HORIZON_DAYS[request.horizon]

    cache_params = {
        "horizon": request.horizon,
        "inc_rec": str(request.include_receivables),
        "inc_pay": str(request.include_payables),
    }
    cache_key = make_cache_key(tenant.tenant_id, "cashflow", cache_params)
    cached = await cache_get(cache_key)
    if cached:
        result = CashflowForecastResponse(**cached)
        result.cached = True
        return result

    # Tarihsel nakit akışı verisi
    end_date = date.today()
    start_date = end_date - timedelta(days=540)  # 18 ay
    raw_data = await get_historical_features(
        tenant_id=tenant.tenant_id,
        feature_refs=["tenant_financial_features:daily_inflow", "tenant_financial_features:daily_outflow"],
        start_date=start_date,
        end_date=end_date,
    )

    if len(raw_data) < _PROPHET_MIN_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nakit akışı tahmini için en az {_PROPHET_MIN_DAYS} gün veri gerekli, "
                   f"mevcut {len(raw_data)} gün",
        )

    cashflow_features = build_cashflow_features(raw_data)
    forecaster = ProphetCashflowForecaster()
    forecaster.fit(raw_data)

    # Mevcut nakit pozisyonu (Feast'ten veya stub)
    initial_cash = 0.0

    raw_forecast = forecaster.predict(raw_data, horizon_days, initial_cash)

    cashflow_points = [
        CashflowPoint(
            ds=date.fromisoformat(p["ds"]),
            inflow=p["inflow"],
            outflow=p["outflow"],
            net=p["net"],
            cumulative=p["cumulative"],
            net_lower=p["net_lower"],
            net_upper=p["net_upper"],
        )
        for p in raw_forecast
    ]

    ending_cash = cashflow_points[-1].cumulative if cashflow_points else initial_cash
    min_cash = min((p.cumulative for p in cashflow_points), default=initial_cash)
    min_date = next(
        (p.ds for p in cashflow_points if p.cumulative == min_cash), None
    )

    response = CashflowForecastResponse(
        tenant_id=tenant.tenant_id,
        model_used="prophet",
        horizon_days=horizon_days,
        forecast_date=date.today(),
        ending_cash_position=round(ending_cash, 2),
        min_cash_point=round(min_cash, 2),
        min_cash_date=min_date,
        cashflow_points=cashflow_points,
        risk_flag=min_cash < 0,
        cached=False,
    )

    await cache_set(cache_key, response.model_dump(), ttl_seconds=7200)
    return response


def _generate_sales_shap(features: list[dict], tenant_id: str) -> list:
    """XGBoost modeli için SHAP açıklaması üretir."""
    import numpy as np

    model_info = registry.get_production_model("sales_xgb", tenant_id)
    if not model_info or not features:
        explainer = ShapExplainer(model=None)
        feature_names = [k for k in features[-1].keys() if k not in ("ds", "y")]
        return explainer.explain(np.array([[0.0]]), feature_names)

    # TODO: Gerçek model yüklendikten sonra TreeExplainer ile açıkla
    explainer = ShapExplainer(model=None)
    feature_names = [k for k in features[-1].keys() if k not in ("ds", "y")]
    return [
        {"feature": f, "value": 0.0, "shap_value": 0.0, "direction": "arttırıyor"}
        for f in feature_names[:5]
    ]
