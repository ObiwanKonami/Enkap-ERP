"""
Fatura okuma ve yapılandırma aracı.

PDF/görüntü veya düz metinden fatura bilgilerini çıkarır.
Önce OCR (pytesseract), ardından LLM ile yapılandırma yapılır.
"""

import base64
import json
import logging
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class InvoiceItem(BaseModel):
    """Fatura kalemi."""

    description: str
    quantity: float = 1.0
    unit_price: int = Field(description="Birim fiyat kuruş cinsinden")
    kdv_rate: int = Field(description="KDV oranı: 0, 1, 10 veya 20")


class InvoiceData(BaseModel):
    """
    Faturadan çıkarılan yapılandırılmış veri.

    Tüm tutarlar kuruş cinsinden saklanır (bigint benzeri).
    Göstermede ₺1.234,56 formatına dönüştürülür.
    """

    vendor_name: Optional[str] = None
    # Vergi Kimlik Numarası (10 hane) veya TC Kimlik No (11 hane)
    vkn_tckn: Optional[str] = None
    invoice_date: Optional[str] = Field(
        default=None, description="GG.AA.YYYY formatında fatura tarihi"
    )
    invoice_no: Optional[str] = None
    # KDV hariç tutar, kuruş cinsinden
    amount: Optional[int] = None
    kdv_rate: Optional[int] = Field(default=None, description="Genel KDV oranı: 0, 1, 10 veya 20")
    # KDV tutarı, kuruş cinsinden
    kdv_amount: Optional[int] = None
    # KDV dahil toplam, kuruş cinsinden
    total_amount: Optional[int] = None
    items: list[InvoiceItem] = Field(default_factory=list)
    # LLM çıkarım güven skoru (0.0 — 1.0)
    confidence: float = 0.0
    raw_text: Optional[str] = Field(default=None, description="OCR ile elde edilen ham metin")


class InvoiceReaderTool:
    """
    Fatura okuma ve yapılandırma aracı.

    Metin veya görüntüden fatura verilerini LLM yardımıyla çıkarır.
    OCR desteği pytesseract ile sağlanır (Türkçe dil paketi gerektirir).
    """

    def __init__(self, openai_client: "OpenAIClient") -> None:  # type: ignore[name-defined]
        from ..llm.prompt_templates import FATURA_ANALIZ_PROMPTU

        self._client = openai_client
        self._system_prompt = FATURA_ANALIZ_PROMPTU

    async def extract_from_text(self, text: str, tenant_id: str) -> InvoiceData:
        """
        Düz metinden fatura bilgilerini yapılandırır.

        LLM metin içindeki fatura alanlarını (VKN, tutar, KDV vb.) tanıyarak
        yapılandırılmış InvoiceData döner.
        """
        logger.info(
            "Metinden fatura çıkarımı başladı — tenant_id=%s metin_uzunluğu=%d",
            tenant_id,
            len(text),
        )

        messages = [
            {
                "role": "user",
                "content": f"Aşağıdaki fatura metnini analiz et ve JSON formatında döndür:\n\n{text}",
            }
        ]

        raw_response = await self._client.chat_completion(
            messages=messages,
            system_prompt=self._system_prompt,
            tenant_id=tenant_id,
            temperature=0.0,  # Fatura çıkarımında deterministik davranış istiyoruz
        )

        return self._parse_llm_response(raw_response, raw_text=text)

    async def extract_from_image(self, base64_image: str, tenant_id: str) -> InvoiceData:
        """
        Base64 kodlanmış görüntüden fatura bilgilerini çıkarır.

        Önce pytesseract OCR denenir. Başarısız olursa doğrudan
        OpenAI vision API'ye gönderilir.
        """
        logger.info("Görüntüden fatura çıkarımı başladı — tenant_id=%s", tenant_id)

        # Önce OCR dene — pytesseract ile Türkçe metin çıkarımı
        ocr_text: Optional[str] = None
        try:
            ocr_text = self._ocr_from_base64(base64_image)
            if ocr_text and len(ocr_text.strip()) > 20:
                logger.debug(
                    "OCR başarılı — tenant_id=%s karakter_sayısı=%d", tenant_id, len(ocr_text)
                )
                return await self.extract_from_text(ocr_text, tenant_id)
        except Exception as exc:
            logger.warning(
                "OCR başarısız, vision API'ye geçiliyor — tenant_id=%s hata=%s",
                tenant_id,
                str(exc),
            )

        # OCR başarısız → OpenAI vision API
        prompt = (
            "Bu fatura görüntüsünü analiz et. "
            "Tüm fatura bilgilerini (satıcı, VKN/TCKN, tarih, tutar, KDV, kalemler) "
            "JSON formatında çıkar. Türk fatura standardını kullan."
        )
        raw_response = await self._client.vision_completion(
            base64_image=base64_image,
            prompt=prompt,
            tenant_id=tenant_id,
        )

        return self._parse_llm_response(raw_response, raw_text=ocr_text)

    def _ocr_from_base64(self, base64_image: str) -> str:
        """
        Base64 görüntüden Türkçe OCR metni çıkarır.
        pytesseract yüklü değilse ImportError fırlatır.
        """
        import io

        import pytesseract  # type: ignore[import-untyped]
        from PIL import Image

        image_bytes = base64.b64decode(base64_image)
        image = Image.open(io.BytesIO(image_bytes))

        # Türkçe + İngilizce dil kombinasyonu (VKN, tarih gibi alfanümerik için)
        text: str = pytesseract.image_to_string(image, lang="tur+eng")
        return text

    def _parse_llm_response(
        self, raw_response: str, raw_text: Optional[str] = None
    ) -> InvoiceData:
        """
        LLM JSON yanıtını InvoiceData Pydantic modeline dönüştürür.
        Parse hatası durumunda boş InvoiceData döner (exception fırlatmaz).
        """
        # Dummy mode yanıtı
        if "[DUMMY MODE]" in raw_response:
            return InvoiceData(confidence=0.0, raw_text=raw_text)

        # JSON bloğunu bul (LLM bazen markdown code block içinde döner)
        json_str = raw_response
        if "```json" in raw_response:
            start = raw_response.find("```json") + 7
            end = raw_response.find("```", start)
            json_str = raw_response[start:end].strip()
        elif "```" in raw_response:
            start = raw_response.find("```") + 3
            end = raw_response.find("```", start)
            json_str = raw_response[start:end].strip()

        try:
            data = json.loads(json_str)
            invoice = InvoiceData(
                vendor_name=data.get("vendor_name"),
                vkn_tckn=data.get("vkn_tckn"),
                invoice_date=data.get("invoice_date"),
                invoice_no=data.get("invoice_no"),
                amount=data.get("amount"),
                kdv_rate=data.get("kdv_rate"),
                kdv_amount=data.get("kdv_amount"),
                total_amount=data.get("total_amount"),
                items=[InvoiceItem(**item) for item in data.get("items", [])],
                confidence=0.85,  # LLM başarılı çıkarım için sabit güven skoru
                raw_text=raw_text,
            )
            return invoice
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            logger.warning("LLM yanıtı parse edilemedi — hata=%s", str(exc))
            return InvoiceData(confidence=0.0, raw_text=raw_text)
