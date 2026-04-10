"""
Enkap AI Muhasebe Asistanı — FastAPI uygulaması.

Sprint 6A: Türkçe LLM, OCR, Belge Analizi, Tahmin Açıklama.
Port: 3016
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import get_settings
from .llm.openai_client import OpenAIClient
from .routers import chat, document, forecast

# Uygulama başlamadan önce log seviyesini ayarla
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# OpenAI client — uygulama genelinde tek örnek (singleton)
_openai_client: OpenAIClient | None = None


def get_openai_client() -> OpenAIClient:
    """Uygulama genelindeki OpenAI client singleton'ını döner."""
    if _openai_client is None:
        raise RuntimeError("OpenAI client henüz başlatılmadı — lifespan hatası")
    return _openai_client


def _init_tracing() -> bool:
    """
    OpenTelemetry tracing'i başlatır.
    OTEL_EXPORTER_OTLP_ENDPOINT tanımlı değilse sessizce devre dışı kalır.
    Döner: tracing aktif mi?
    """
    endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT
    if not endpoint:
        logger.debug("OTEL_EXPORTER_OTLP_ENDPOINT tanımlı değil — tracing devre dışı")
        return False

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({"service.name": "ai-assistant"})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        logger.info("OpenTelemetry tracing başlatıldı — endpoint=%s", endpoint)
        return True

    except Exception as exc:
        logger.warning("OpenTelemetry başlatılamadı — tracing devre dışı: %s", str(exc))
        return False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Uygulama yaşam döngüsü yönetimi.

    Startup: OpenAI client başlat, tracing kur
    Shutdown: Kaynakları temizle
    """
    global _openai_client

    # OpenTelemetry tracing — env yoksa sessiz degrade
    _init_tracing()

    # OpenAI client başlat
    _openai_client = OpenAIClient(
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_MODEL,
        timeout=settings.OPENAI_TIMEOUT,
    )

    if _openai_client.is_dummy:
        logger.warning(
            "AI asistan dummy modda çalışıyor. "
            "Gerçek yanıtlar için OPENAI_API_KEY ortam değişkenini ayarlayın."
        )
    else:
        logger.info(
            "AI asistan başlatıldı — model=%s port=3016",
            settings.OPENAI_MODEL,
        )

    yield

    # Shutdown temizliği
    logger.info("AI asistan kapatılıyor")
    _openai_client = None


app = FastAPI(
    title="Enkap AI Muhasebe Asistanı",
    version="1.0.0",
    description=(
        "Türkçe muhasebe uzmanı AI asistanı. "
        "VUK/TFRS, KDV, TDHP, e-Fatura, GİB konularında yardım eder. "
        "Fatura OCR, anomali açıklama ve tahmin yorumlama özellikleri içerir."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
cors_origins = (
    settings.CORS_ORIGINS.split(",")
    if settings.CORS_ORIGINS != "*"
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenTelemetry FastAPI enstrümanı — tracing aktifse bağla
if settings.OTEL_EXPORTER_OTLP_ENDPOINT:
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(app)
    except Exception:
        pass  # Tracing başlatılamasa da uygulama çalışmaya devam eder


# ── Router'lar ─────────────────────────────────────────────────────────────
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(document.router, prefix="/api/v1", tags=["document"])
app.include_router(forecast.router, prefix="/api/v1", tags=["forecast"])


# ── Global exception handler ──────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Yakalanmayan tüm exception'ları Türkçe hata mesajına dönüştürür.
    Tenant bilgisi varsa loga eklenir.
    """
    logger.error(
        "Beklenmeyen hata — path=%s method=%s hata=%s",
        request.url.path,
        request.method,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.",
            "error_type": type(exc).__name__,
        },
    )


# ── Health endpoint'leri ──────────────────────────────────────────────────
@app.get("/health", tags=["health"], summary="Liveness probe")
async def health_liveness() -> dict[str, str]:
    """
    Kubernetes liveness probe.
    Uygulama ayaktaysa 200 döner.
    """
    return {"status": "ok", "service": "ai-assistant"}


@app.get("/health/ready", tags=["health"], summary="Readiness probe")
async def health_readiness() -> JSONResponse:
    """
    Kubernetes readiness probe.
    OpenAI client başlatıldıysa hazır (dummy mode dahil).
    """
    is_ready = _openai_client is not None
    mode = "dummy" if (_openai_client and _openai_client.is_dummy) else "live"

    if not is_ready:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_ready", "service": "ai-assistant"},
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "ready",
            "service": "ai-assistant",
            "llm_mode": mode,
            "model": settings.OPENAI_MODEL,
        },
    )


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=3016,
        reload=True,
        log_level=settings.LOG_LEVEL.lower(),
    )
