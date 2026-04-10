"""
ML servis Pydantic istek/yanıt şemaları.

Tüm tutarlar Türk Lirası (TRY) cinsindendir.
Tarihler ISO-8601 formatında (YYYY-MM-DD).
"""

from datetime import date
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ─── Ortak ──────────────────────────────────────────────────────────────────

class ForecastHorizon(str, Enum):
    """Tahmin ufku seçenekleri."""
    WEEK_1  = "7d"
    WEEK_2  = "14d"
    MONTH_1 = "30d"
    MONTH_3 = "90d"
    MONTH_6 = "180d"


class ConfidenceInterval(BaseModel):
    lower: float = Field(description="Alt güven sınırı (%80)")
    upper: float = Field(description="Üst güven sınırı (%80)")


# ─── Satış Tahmini (XGBoost / Prophet) ──────────────────────────────────────

class SalesForecastRequest(BaseModel):
    """
    Satış tahmini isteği.
    Geçmiş veri 90 günden az ise XGBoost, 180+ günde Prophet önceliklidir.
    """
    horizon: ForecastHorizon = ForecastHorizon.MONTH_1
    product_id: str | None = Field(
        default=None,
        description="Belirli ürün için tahmin. None → tenant geneli.",
    )
    category_id: str | None = Field(
        default=None,
        description="Kategori bazında tahmin.",
    )
    include_shap: bool = Field(
        default=False,
        description="SHAP açıklaması dahil edilsin mi? Yanıt süresini artırır.",
    )

    @field_validator("horizon")
    @classmethod
    def validate_horizon(cls, v: ForecastHorizon) -> ForecastHorizon:
        return v


class DailyForecastPoint(BaseModel):
    ds: date = Field(description="Tarih")
    yhat: float = Field(description="Tahmin edilen günlük gelir (TRY)")
    yhat_lower: float = Field(description="Alt güven sınırı")
    yhat_upper: float = Field(description="Üst güven sınırı")
    trend: float | None = Field(default=None, description="Trend bileşeni")
    weekly_seasonality: float | None = Field(default=None, description="Haftalık mevsimsellik")


class ShapFeatureContribution(BaseModel):
    feature: str = Field(description="Özellik adı (Türkçe)")
    value: float = Field(description="Ham özellik değeri")
    shap_value: float = Field(description="SHAP katkısı (TRY)")
    direction: str = Field(description="'arttırıyor' | 'azaltıyor'")


class SalesForecastResponse(BaseModel):
    tenant_id: str
    model_used: str = Field(description="'xgboost' | 'prophet'")
    horizon_days: int
    forecast_date: date = Field(description="Tahmin oluşturma tarihi")
    total_predicted_revenue: float = Field(description="Ufuk boyunca toplam tahmin (TRY)")
    confidence_interval: ConfidenceInterval
    daily_forecast: list[DailyForecastPoint]
    shap_explanation: list[ShapFeatureContribution] | None = None
    cached: bool = Field(default=False)


# ─── Nakit Akışı Tahmini (Prophet) ──────────────────────────────────────────

class CashflowForecastRequest(BaseModel):
    """
    Nakit akışı tahmini.
    Prophet modeli — en az 6 aylık tarihsel veri gerekir.
    """
    horizon: ForecastHorizon = ForecastHorizon.MONTH_3
    include_receivables: bool = Field(
        default=True,
        description="Alacak tahsilat beklentisi dahil edilsin mi?",
    )
    include_payables: bool = Field(
        default=True,
        description="Borç ödemeleri dahil edilsin mi?",
    )


class CashflowPoint(BaseModel):
    ds: date
    inflow: float = Field(description="Tahmini nakit girişi (TRY)")
    outflow: float = Field(description="Tahmini nakit çıkışı (TRY)")
    net: float = Field(description="Net nakit akışı (TRY)")
    cumulative: float = Field(description="Kümülatif net nakit (TRY)")
    net_lower: float
    net_upper: float


class CashflowForecastResponse(BaseModel):
    tenant_id: str
    model_used: str = Field(default="prophet")
    horizon_days: int
    forecast_date: date
    ending_cash_position: float = Field(description="Ufuk sonunda beklenen nakit (TRY)")
    min_cash_point: float = Field(description="Ufuk boyunca minimum nakit seviyesi")
    min_cash_date: date | None = Field(description="Minimum nakit tarihi")
    cashflow_points: list[CashflowPoint]
    risk_flag: bool = Field(description="True → nakit negatife düşme riski var")
    cached: bool = Field(default=False)


# ─── Anomali Tespiti (Isolation Forest) ─────────────────────────────────────

class AnomalyDetectionRequest(BaseModel):
    """
    Finansal anomali tespiti.
    Isolation Forest — denetimsiz öğrenme.
    """
    start_date: date
    end_date: date
    sensitivity: float = Field(
        default=0.05,
        ge=0.01,
        le=0.20,
        description="Anomali eşiği (contamination). Küçük = daha az anomali.",
    )
    include_shap: bool = Field(default=True)


class AnomalyRecord(BaseModel):
    date: date
    metric: str = Field(description="Hangi metrik (örn: 'günlük_gelir')")
    actual_value: float
    expected_range_lower: float
    expected_range_upper: float
    anomaly_score: float = Field(description="-1=anomali, 0=normal (normalize edilmiş)")
    severity: str = Field(description="'düşük' | 'orta' | 'yüksek'")
    shap_explanation: list[ShapFeatureContribution] | None = None


class AnomalyDetectionResponse(BaseModel):
    tenant_id: str
    period_start: date
    period_end: date
    total_records_analyzed: int
    anomaly_count: int
    anomaly_rate: float = Field(description="Anomali oranı (0-1)")
    anomalies: list[AnomalyRecord]
    model_version: str
    cached: bool = Field(default=False)
