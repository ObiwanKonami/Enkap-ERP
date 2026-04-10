"""
SHAP değerlerini Türkçe iş diline çeviren açıklama aracı.

ML Inference servisinin ürettiği SHAP değerlerini yöneticilerin
anlayabileceği Türkçe açıklamalara dönüştürür.
"""

import logging

logger = logging.getLogger(__name__)


class AnomalyExplainerTool:
    """
    Anomali açıklama aracı.

    SHAP değerleri (makine öğrenmesi açıklanabilirlik çıktısı) ile
    özellik isimlerini alarak Türkçe iş açıklaması üretir.
    """

    def __init__(self, openai_client: "OpenAIClient") -> None:  # type: ignore[name-defined]
        from ..llm.prompt_templates import ANOMALI_ACIKLAMA_PROMPTU

        self._client = openai_client
        self._system_prompt = ANOMALI_ACIKLAMA_PROMPTU

    async def explain(
        self,
        shap_values: dict[str, float],
        feature_names: list[str],
        tenant_id: str,
        anomaly_score: float = 0.0,
    ) -> str:
        """
        SHAP değerlerini Türkçe açıklamaya dönüştürür.

        Parametreler:
            shap_values   : {özellik_adı: SHAP değeri} sözlüğü
            feature_names : Açıklaması yapılacak özellik adları
            tenant_id     : Log takibi için tenant kimliği
            anomaly_score : ML modelinden gelen anomali skoru (0.0 — 1.0)

        Döner:
            "Bu anomalinin en büyük nedeni X (%Y katkı)" şeklinde Türkçe açıklama
        """
        logger.info(
            "Anomali açıklaması başladı — tenant_id=%s özellik_sayısı=%d anomali_skoru=%.3f",
            tenant_id,
            len(shap_values),
            anomaly_score,
        )

        # SHAP değerlerini katkı yüzdelerine çevir
        total_abs = sum(abs(v) for v in shap_values.values())
        contributions = {}
        if total_abs > 0:
            contributions = {
                k: round(abs(v) / total_abs * 100, 1) for k, v in shap_values.items()
            }

        # En önemli 5 faktörü sırala (yüksekten düşüğe)
        top_factors = sorted(contributions.items(), key=lambda x: x[1], reverse=True)[:5]

        # LLM için yapılandırılmış girdi oluştur
        factors_text = "\n".join(
            [f"- {name}: %{pct} katkı (SHAP={shap_values.get(name, 0):.4f})"
             for name, pct in top_factors]
        )

        user_message = (
            f"Anomali skoru: {anomaly_score:.3f} (1.0 = tam anomali)\n\n"
            f"En önemli faktörler:\n{factors_text}\n\n"
            f"Tüm özellikler: {', '.join(feature_names)}\n\n"
            "Bu anomaliyi Türkçe olarak açıkla. "
            "Yöneticinin anlayabileceği bir iş açıklaması yaz."
        )

        explanation = await self._client.chat_completion(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=self._system_prompt,
            tenant_id=tenant_id,
            temperature=0.3,
        )

        logger.debug(
            "Anomali açıklaması tamamlandı — tenant_id=%s açıklama_uzunluğu=%d",
            tenant_id,
            len(explanation),
        )

        return explanation

    def format_contribution_summary(
        self, shap_values: dict[str, float]
    ) -> list[dict[str, float | str]]:
        """
        SHAP değerlerini sıralı katkı özetine çevirir.
        LLM çağrısı olmadan hızlı özet için kullanılır.

        Döner:
            [{"feature": "...", "contribution_pct": 45.2, "direction": "artış"}]
        """
        total_abs = sum(abs(v) for v in shap_values.values()) or 1.0
        summary = []

        for feature, value in sorted(shap_values.items(), key=lambda x: abs(x[1]), reverse=True):
            summary.append(
                {
                    "feature": feature,
                    "contribution_pct": round(abs(value) / total_abs * 100, 1),
                    "direction": "artış" if value > 0 else "düşüş",
                    "shap_value": round(value, 4),
                }
            )

        return summary
