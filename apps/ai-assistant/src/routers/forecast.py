"""
Tahmin açıklama endpoint'i.

ML Inference servisinin ürettiği satış ve nakit akışı tahminlerini
Türkçe iş diline çevirerek açıklar.
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core.auth import TenantContext, TenantDep, require_ai_feature

logger = logging.getLogger(__name__)

router = APIRouter()


class ForecastExplainRequest(BaseModel):
    forecast_type: Literal["sales", "cashflow"] = Field(
        description="Tahmin tipi: sales (satış) veya cashflow (nakit akışı)"
    )
    period: str = Field(description="Tahmin dönemi (örn. 'Nisan 2026' veya 'Q2 2026')")
    # ML modelinden gelen tahmin verisi
    forecast_data: dict = Field(
        description=(
            "Tahmin verileri. Örnek: "
            "{'predicted_value': 150000, 'confidence_low': 130000, 'confidence_high': 170000, "
            "'trend': 'increasing', 'seasonality_effect': 0.15}"
        )
    )
    # SHAP değerleri — ML modelinden gelen açıklanabilirlik verisi (opsiyonel)
    shap_values: Optional[dict[str, float]] = Field(
        default=None,
        description="SHAP değerleri {özellik_adı: değer} — AnomalyExplainerTool için",
    )


class ForecastExplainResponse(BaseModel):
    # Tahmin için Türkçe iş açıklaması
    explanation: str = Field(description="Tahmin için Türkçe iş açıklaması")
    # En önemli faktörler (maksimum 5)
    key_factors: list[str] = Field(
        description="Tahmini en çok etkileyen faktörler (Türkçe)"
    )
    # Önerilen iş aksiyonları
    recommendations: list[str] = Field(
        description="Tahmine dayalı önerilen aksiyonlar"
    )


@router.post(
    "/explain-forecast",
    response_model=ForecastExplainResponse,
    summary="ML tahminini Türkçe açıkla",
    description=(
        "XGBoost/Prophet modelinin ürettiği satış veya nakit akışı tahminini "
        "Türkçe iş diline çevirir. SHAP değerleri varsa detaylı faktör analizi yapar."
    ),
)
async def explain_forecast(
    request: ForecastExplainRequest,
    ctx: TenantDep,  # type: ignore[valid-type]
) -> ForecastExplainResponse:
    """
    ML tahmin sonuçlarını Türkçe iş analizine dönüştürür.

    SHAP değerleri sağlanmışsa hangi faktörlerin tahmini en çok etkilediğini
    yüzde katkılarıyla açıklar.
    """
    require_ai_feature(ctx)

    from ..main import get_openai_client
    openai_client = get_openai_client()

    from ..llm.prompt_templates import TAHMIN_ACIKLAMA_PROMPTU

    logger.info(
        "Tahmin açıklaması başladı — tenant_id=%s tahmin_tipi=%s dönem=%s",
        ctx.tenant_id,
        request.forecast_type,
        request.period,
    )

    # SHAP değerleri varsa AnomalyExplainerTool ile ön analiz yap
    shap_summary = ""
    key_factors: list[str] = []

    if request.shap_values:
        from ..tools.anomaly_explainer import AnomalyExplainerTool

        explainer = AnomalyExplainerTool(openai_client)
        contributions = explainer.format_contribution_summary(request.shap_values)

        # En önemli 5 faktörü çıkar
        key_factors = [
            f"{item['feature']}: %{item['contribution_pct']:.1f} ({item['direction']})"
            for item in contributions[:5]
        ]

        shap_text = "\n".join([
            f"  - {item['feature']}: %{item['contribution_pct']:.1f} katkı ({item['direction']})"
            for item in contributions[:5]
        ])
        shap_summary = f"\nSHAP faktör analizi:\n{shap_text}"

    # Tahmin verisi metnini hazırla
    forecast_type_tr = "Satış Tahmini" if request.forecast_type == "sales" else "Nakit Akışı Tahmini"
    predicted = request.forecast_data.get("predicted_value", 0)
    conf_low = request.forecast_data.get("confidence_low")
    conf_high = request.forecast_data.get("confidence_high")
    trend = request.forecast_data.get("trend", "")
    seasonality = request.forecast_data.get("seasonality_effect")

    trend_tr = {
        "increasing": "artış",
        "decreasing": "düşüş",
        "stable": "stabil",
        "volatile": "dalgalı",
    }.get(trend, trend)

    forecast_text = (
        f"Tahmin tipi: {forecast_type_tr}\n"
        f"Dönem: {request.period}\n"
        f"Tahmin değeri: {predicted:,} kuruş\n"
    )
    if conf_low and conf_high:
        forecast_text += f"Güven aralığı: {conf_low:,} — {conf_high:,} kuruş\n"
    if trend_tr:
        forecast_text += f"Trend: {trend_tr}\n"
    if seasonality is not None:
        forecast_text += f"Mevsimsellik etkisi: %{seasonality * 100:.1f}\n"
    forecast_text += shap_summary

    user_message = (
        f"{forecast_text}\n\n"
        "Bu tahmini Türkçe iş diliyle açıkla. "
        "Ayrıca şu başlıkları ele al:\n"
        "1. Tahminin kısa özeti\n"
        "2. Kritik dönemler\n"
        "3. Stratejik öneriler (stok, nakit, kaynak planlaması)"
    )

    explanation = await openai_client.chat_completion(
        messages=[{"role": "user", "content": user_message}],
        system_prompt=TAHMIN_ACIKLAMA_PROMPTU,
        tenant_id=ctx.tenant_id,
        temperature=0.3,
    )

    # LLM yoksa key_factors dummy ile doldur
    if not key_factors:
        key_factors = [
            "Geçmiş dönem satış trendi",
            "Mevsimsellik etkisi",
            "Pazar koşulları",
        ]

    # Öneriler — tahmin tipine göre varsayılan öneriler
    recommendations = _generate_recommendations(
        forecast_type=request.forecast_type,
        trend=trend,
        predicted_value=predicted,
    )

    logger.debug(
        "Tahmin açıklaması tamamlandı — tenant_id=%s", ctx.tenant_id
    )

    return ForecastExplainResponse(
        explanation=explanation,
        key_factors=key_factors,
        recommendations=recommendations,
    )


def _generate_recommendations(
    forecast_type: str,
    trend: str,
    predicted_value: int,
) -> list[str]:
    """
    Tahmin tipine ve trende göre varsayılan öneriler üretir.
    LLM çağrısı olmadan hızlı öneri için fallback olarak kullanılır.
    """
    recommendations: list[str] = []

    if forecast_type == "sales":
        if trend == "increasing":
            recommendations.extend([
                "Stok seviyelerini artış trendine göre güncelleyin.",
                "Üretim/tedarik kapasitesini artışa hazırlayın.",
                "Büyüyen talebi karşılamak için ek personel değerlendirin.",
            ])
        elif trend == "decreasing":
            recommendations.extend([
                "Stok fazlasını önlemek için sipariş miktarlarını azaltın.",
                "Satış teşvik kampanyaları planlayın.",
                "Düşük performanslı ürün/müşteri segmentlerini analiz edin.",
            ])
        else:
            recommendations.extend([
                "Stok seviyelerini mevcut tahmine göre koruyun.",
                "Aylık satış performansını yakından takip edin.",
            ])

    else:  # cashflow
        if trend == "decreasing":
            recommendations.extend([
                "Nakit açığını karşılamak için kredi limitlerini gözden geçirin.",
                "Alacakların tahsilat sürecini hızlandırın.",
                "Kritik olmayan harcamaları erteleyin.",
            ])
        else:
            recommendations.extend([
                "Fazla nakdi kısa vadeli yatırım araçlarında değerlendirin.",
                "Tedarikçilere erken ödeme ile iskonto talep edin.",
            ])

    return recommendations
