"""
Belge analizi endpoint'i.

PDF, PNG ve JPG formatındaki belgeleri (fatura, makbuz, banka ekstresi)
analiz ederek yapılandırılmış veri çıkarır.
"""

import base64
import logging
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from ..core.auth import TenantContext, TenantDep, require_ai_feature

logger = logging.getLogger(__name__)

router = APIRouter()

# Desteklenen belge formatları ve MIME tipleri
_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
}
# Maksimum yükleme boyutu: 10 MB
_MAX_FILE_SIZE = 10 * 1024 * 1024


class DocumentAnalysisResponse(BaseModel):
    # Belgeden çıkarılan yapılandırılmış veri
    extracted_data: dict = Field(description="Belgeden çıkarılan yapılandırılmış veri")
    # LLM çıkarım güven skoru (0.0 — 1.0)
    confidence: float = Field(ge=0.0, le=1.0, description="Çıkarım güven skoru")
    # Kullanıcıya önerilen aksiyonlar veya düzeltmeler
    suggestions: list[str] = Field(
        default_factory=list,
        description="Önerilen aksiyonlar (eksik alan, olası hata vb.)",
    )
    document_type: str = Field(description="Tespit edilen belge tipi")


@router.post(
    "/analyze-document",
    response_model=DocumentAnalysisResponse,
    summary="Belge analizi — fatura, makbuz veya banka ekstresi",
    description=(
        "Yüklenen PDF veya görüntü dosyasından yapılandırılmış veri çıkarır. "
        "Türk e-Fatura standardı desteklenir."
    ),
)
async def analyze_document(
    ctx: TenantDep,  # type: ignore[valid-type]
    file: UploadFile = File(..., description="PDF, PNG veya JPG belge"),
    document_type: Literal["invoice", "receipt", "statement"] = Form(
        ...,
        description="Belge tipi: invoice (fatura), receipt (makbuz), statement (banka ekstresi)",
    ),
) -> DocumentAnalysisResponse:
    """
    Yüklenen belgeyi analiz eder ve yapılandırılmış veri döner.

    - invoice: Fatura → vendor, VKN, tutar, KDV, kalemler
    - receipt: Makbuz → tarih, tutar, satıcı
    - statement: Banka ekstresi → hareket listesi, bakiyeler
    """
    require_ai_feature(ctx)

    # Dosya tipi kontrolü
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Desteklenmeyen dosya formatı: {content_type}. "
                "PDF, JPEG veya PNG yükleyin."
            ),
        )

    # Dosya boyutu kontrolü
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Dosya boyutu 10 MB sınırını aşıyor.",
        )

    logger.info(
        "Belge analizi başladı — tenant_id=%s belge_tipi=%s dosya_boyutu=%d",
        ctx.tenant_id,
        document_type,
        len(file_bytes),
    )

    from ..main import get_openai_client
    openai_client = get_openai_client()

    # Fatura analizi — InvoiceReaderTool kullan
    if document_type == "invoice":
        from ..tools.invoice_reader import InvoiceReaderTool

        tool = InvoiceReaderTool(openai_client)

        if content_type == "application/pdf":
            # PDF'den metin çıkar
            extracted_text = _extract_text_from_pdf(file_bytes)
            if extracted_text:
                invoice_data = await tool.extract_from_text(extracted_text, ctx.tenant_id)
            else:
                # PDF görüntü tabanlıysa Base64'e çevir ve vision API kullan
                b64 = base64.b64encode(file_bytes).decode("utf-8")
                invoice_data = await tool.extract_from_image(b64, ctx.tenant_id)
        else:
            # Görüntü dosyası — doğrudan Base64 gönder
            b64 = base64.b64encode(file_bytes).decode("utf-8")
            invoice_data = await tool.extract_from_image(b64, ctx.tenant_id)

        suggestions = _generate_invoice_suggestions(invoice_data)

        return DocumentAnalysisResponse(
            extracted_data=invoice_data.model_dump(exclude={"raw_text"}),
            confidence=invoice_data.confidence,
            suggestions=suggestions,
            document_type="invoice",
        )

    # Banka ekstresi analizi — LLM ile tablo yapısını tanı
    elif document_type == "statement":
        return await _analyze_bank_statement(file_bytes, content_type, ctx.tenant_id, openai_client)

    # Makbuz analizi — basit fatura benzeri çıkarım
    else:  # receipt
        return await _analyze_receipt(file_bytes, content_type, ctx.tenant_id, openai_client)


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    PDF'den düz metin çıkarır.
    pypdf yüklü değilse boş string döner.
    """
    try:
        import io

        import pypdf  # type: ignore[import-untyped]

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text_parts = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(text_parts)
    except ImportError:
        logger.debug("pypdf yüklü değil — PDF metin çıkarımı atlandı")
        return ""
    except Exception as exc:
        logger.warning("PDF metin çıkarım hatası: %s", str(exc))
        return ""


def _generate_invoice_suggestions(invoice_data) -> list[str]:
    """
    Eksik veya hatalı fatura alanları için öneri listesi oluşturur.
    """
    suggestions = []

    if not invoice_data.vendor_name:
        suggestions.append("Satıcı adı tespit edilemedi — lütfen manuel olarak girin.")
    if not invoice_data.vkn_tckn:
        suggestions.append("VKN/TCKN tespit edilemedi — vergi numarasını manuel doğrulayın.")
    if not invoice_data.invoice_date:
        suggestions.append("Fatura tarihi okunamadı — GG.AA.YYYY formatında girin.")
    if invoice_data.kdv_rate and invoice_data.kdv_rate not in (0, 1, 10, 20):
        suggestions.append(
            f"Olağandışı KDV oranı: %{invoice_data.kdv_rate}. "
            "Geçerli oranlar: %0, %1, %10, %20."
        )
    if invoice_data.confidence < 0.5:
        suggestions.append("Çıkarım güveni düşük — tüm alanları manuel doğrulayın.")

    return suggestions


async def _analyze_bank_statement(
    file_bytes: bytes,
    content_type: str,
    tenant_id: str,
    openai_client,
) -> DocumentAnalysisResponse:
    """Banka ekstresi — hareket listesini ve bakiyeleri çıkarır."""
    from ..llm.prompt_templates import MUHASEBE_SISTEM_PROMPTU

    if content_type != "application/pdf":
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        prompt = (
            "Bu banka ekstresi görüntüsünü analiz et. "
            "Tüm hesap hareketlerini (tarih, açıklama, borç, alacak, bakiye) "
            "JSON array formatında çıkar. "
            "Ayrıca açılış ve kapanış bakiyesini belirt."
        )
        result = await openai_client.vision_completion(b64, prompt, tenant_id)
    else:
        text = _extract_text_from_pdf(file_bytes)
        messages = [
            {
                "role": "user",
                "content": (
                    f"Banka ekstresini analiz et:\n\n{text}\n\n"
                    "Hareketleri JSON formatında çıkar: "
                    "[{date, description, debit, credit, balance}]"
                ),
            }
        ]
        result = await openai_client.chat_completion(messages, MUHASEBE_SISTEM_PROMPTU, tenant_id)

    return DocumentAnalysisResponse(
        extracted_data={"raw_analysis": result},
        confidence=0.7,
        suggestions=["Banka ekstresi verilerini muhasebenize aktarmadan önce doğrulayın."],
        document_type="statement",
    )


async def _analyze_receipt(
    file_bytes: bytes,
    content_type: str,
    tenant_id: str,
    openai_client,
) -> DocumentAnalysisResponse:
    """Makbuz — basit tutar ve satıcı çıkarımı."""
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    prompt = (
        "Bu makbuzu analiz et. "
        "Tarih, satıcı adı, toplam tutar ve KDV bilgisini JSON formatında döndür."
    )

    if content_type == "application/pdf":
        from ..llm.prompt_templates import MUHASEBE_SISTEM_PROMPTU

        text = _extract_text_from_pdf(file_bytes)
        result = await openai_client.chat_completion(
            [{"role": "user", "content": f"{prompt}\n\n{text}"}],
            MUHASEBE_SISTEM_PROMPTU,
            tenant_id,
        )
    else:
        result = await openai_client.vision_completion(b64, prompt, tenant_id)

    return DocumentAnalysisResponse(
        extracted_data={"raw_analysis": result},
        confidence=0.75,
        suggestions=[],
        document_type="receipt",
    )
