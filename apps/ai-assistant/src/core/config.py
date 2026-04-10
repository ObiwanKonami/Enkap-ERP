"""
Uygulama yapılandırması — Pydantic Settings ile env yönetimi.

Tüm ortam değişkenleri buradan okunur; eksik kritik değerler
çalışma zamanı yerine startup sırasında yakalanır.
"""

import logging
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── OpenAI ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o"
    # Saniye cinsinden OpenAI istek zaman aşımı
    OPENAI_TIMEOUT: float = 60.0

    # ── JWT ─────────────────────────────────────────────────────────────────
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"

    # ── Diğer servis URL'leri ────────────────────────────────────────────────
    # ML inference servisinden tahmin sonuçlarını almak için
    ML_INFERENCE_URL: str = "http://ml-inference:3005"
    # Mizan/bilanço endpoint'leri için finansal servis
    FINANCIAL_SERVICE_URL: str = "http://financial-service:3003"

    # ── OpenTelemetry ────────────────────────────────────────────────────────
    # Boş bırakılırsa tracing sessizce devre dışı kalır
    OTEL_EXPORTER_OTLP_ENDPOINT: Optional[str] = None

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "*"

    # ── Loglama ──────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton ayar nesnesi — uygulama boyunca tek örnek."""
    settings = Settings()

    if not settings.OPENAI_API_KEY:
        logger.warning(
            "OPENAI_API_KEY tanımlı değil — AI asistan dummy/mock modda çalışacak. "
            "Gerçek LLM yanıtları için bu değişkeni tanımlayın."
        )

    return settings
