"""
Serbest soru-cevap chat endpoint'i.

Muhasebe ve finans sorularını Türkçe yanıtlar.
Gerektiğinde financial-service ve ml-inference servisleri ile iletişim kurar.
"""

import logging
from typing import Literal, Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..core.auth import TenantContext, TenantDep, require_ai_feature
from ..core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000, description="Kullanıcı sorusu")
    context_type: Optional[Literal["invoice", "report", "general"]] = Field(
        default="general",
        description="Soru bağlamı: fatura, rapor veya genel muhasebe",
    )
    # Bağlam verisi: fatura ID, dönem, hesap kodu vb.
    context_data: Optional[dict] = Field(default=None, description="Ek bağlam verisi")


class ChatResponse(BaseModel):
    reply: str = Field(description="AI asistanın Türkçe yanıtı")
    sources: list[str] = Field(
        default_factory=list, description="Yanıtta kullanılan veri kaynakları"
    )
    tokens_used: int = Field(default=0, description="LLM token kullanımı (maliyet takibi)")


async def _fetch_financial_context(
    tenant_id: str,
    context_data: dict,
    financial_service_url: str,
) -> Optional[str]:
    """
    financial-service'den ilgili finansal veriyi çeker.
    Servis erişilemezse None döner (akışı durdurmaz).
    """
    endpoint = context_data.get("endpoint")
    if not endpoint:
        return None

    url = f"{financial_service_url}{endpoint}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Servisler arası iletişimde tenant_id header ile iletilir
            response = await client.get(url, headers={"X-Tenant-ID": tenant_id})
            response.raise_for_status()
            return response.text
    except Exception as exc:
        logger.warning(
            "financial-service erişim hatası — tenant_id=%s url=%s hata=%s",
            tenant_id,
            url,
            str(exc),
        )
        return None


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Muhasebe asistanına soru sor",
    description=(
        "Türkçe muhasebe ve finans sorularını yanıtlar. "
        "KDV hesabı, TDHP hesap kodları, GİB kuralları, e-Fatura vb."
    ),
)
async def chat(
    request: ChatRequest,
    ctx: TenantDep,  # type: ignore[valid-type]
) -> ChatResponse:
    """
    Muhasebe ve finans sorularını Türkçe yanıtlar.

    Örnekler:
      - "Geçen ay KDV matrahım ne kadar?"
      - "100 no'lu hesabın amacı nedir?"
      - "e-Fatura kesme sınırı nedir?"
      - "Cari açığımı nasıl kapatırım?"
    """
    require_ai_feature(ctx)

    settings = get_settings()

    # Uygulama state'inden OpenAI client al (main.py'de singleton olarak tutulur)
    from ..main import get_openai_client

    openai_client = get_openai_client()

    from ..llm.prompt_templates import MUHASEBE_SISTEM_PROMPTU

    sources: list[str] = []
    enriched_message = request.message

    # Bağlam verisi varsa finansal servisten ek veri çek
    if request.context_data and request.context_type in ("invoice", "report"):
        financial_context = await _fetch_financial_context(
            tenant_id=ctx.tenant_id,
            context_data=request.context_data,
            financial_service_url=settings.FINANCIAL_SERVICE_URL,
        )
        if financial_context:
            enriched_message = (
                f"{request.message}\n\n"
                f"İlgili finansal veri:\n{financial_context}"
            )
            sources.append(settings.FINANCIAL_SERVICE_URL)

    logger.info(
        "Chat isteği — tenant_id=%s context_type=%s mesaj_uzunluğu=%d",
        ctx.tenant_id,
        request.context_type,
        len(request.message),
    )

    reply = await openai_client.chat_completion(
        messages=[{"role": "user", "content": enriched_message}],
        system_prompt=MUHASEBE_SISTEM_PROMPTU,
        tenant_id=ctx.tenant_id,
    )

    return ChatResponse(
        reply=reply,
        sources=sources,
        # Token sayısı OpenAI client log'unda maliyet takibi için ayrıca izlenir
        tokens_used=0,
    )
