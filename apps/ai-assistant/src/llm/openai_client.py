"""
OpenAI GPT-4o async client.

OPENAI_API_KEY env yoksa dummy/mock mode devreye girer — exception fırlatmaz,
geliştirme ortamında sistemin çalışmaya devam etmesini sağlar.
"""

import logging
from typing import Optional

from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

# Dummy mode için sabit yanıtlar — gerçek LLM olmadan entegrasyon testinde kullanılır
_DUMMY_RESPONSE = (
    "[DUMMY MODE] OPENAI_API_KEY tanımlı değil. "
    "Bu bir test yanıtıdır. Gerçek AI yanıtı için OPENAI_API_KEY ortam değişkenini tanımlayın."
)


class OpenAIClient:
    """
    OpenAI AsyncOpenAI sarmalayıcı.

    - API anahtarı yoksa mock mode'a geçer
    - Başarısız istekler için otomatik retry (exponential backoff)
    - Token kullanımı loglama (maliyet takibi için)
    """

    def __init__(self, api_key: Optional[str], model: str, timeout: float) -> None:
        self._model = model
        self._timeout = timeout
        self._dummy_mode = not api_key

        if self._dummy_mode:
            logger.warning(
                "OpenAI client dummy modda başlatıldı — gerçek LLM çağrıları devre dışı"
            )
            self._client = None
        else:
            # openai paketi yüklü olduğunda gerçek client oluştur
            try:
                from openai import AsyncOpenAI  # type: ignore[import-untyped]

                self._client = AsyncOpenAI(api_key=api_key, timeout=timeout)
                logger.info("OpenAI client başlatıldı — model=%s", model)
            except ImportError:
                logger.error(
                    "openai paketi yüklü değil — dummy mode'a geçiliyor. "
                    "Yüklemek için: pip install openai"
                )
                self._client = None
                self._dummy_mode = True

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        tenant_id: str,
        temperature: float = 0.2,
    ) -> str:
        """
        OpenAI chat completion çağrısı yapar.

        Parametreler:
            messages      : Kullanıcı/asistan mesaj geçmişi
            system_prompt : LLM için sistem yönlendirmesi
            tenant_id     : Log takibi için tenant kimliği
            temperature   : Yaratıcılık seviyesi (muhasebe için düşük önerilir)

        Döner:
            LLM yanıt metni
        """
        if self._dummy_mode:
            logger.debug("Dummy mode — tenant_id=%s mesaj sayısı=%d", tenant_id, len(messages))
            return _DUMMY_RESPONSE

        full_messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            *messages,
        ]

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=1, max=10),
                retry=retry_if_exception_type(Exception),
                reraise=True,
            ):
                with attempt:
                    response = await self._client.chat.completions.create(  # type: ignore[union-attr]
                        model=self._model,
                        messages=full_messages,  # type: ignore[arg-type]
                        temperature=temperature,
                    )

            content = response.choices[0].message.content or ""
            usage = response.usage

            # Token kullanımını logla — maliyet takibi için
            if usage:
                logger.info(
                    "OpenAI token kullanımı — tenant_id=%s prompt_tokens=%d "
                    "completion_tokens=%d total_tokens=%d",
                    tenant_id,
                    usage.prompt_tokens,
                    usage.completion_tokens,
                    usage.total_tokens,
                )

            return content

        except Exception as exc:
            logger.error(
                "OpenAI API hatası — tenant_id=%s hata=%s",
                tenant_id,
                str(exc),
            )
            raise

    async def vision_completion(
        self,
        base64_image: str,
        prompt: str,
        tenant_id: str,
    ) -> str:
        """
        OpenAI vision API çağrısı — görüntüden metin/veri çıkarma.

        Parametreler:
            base64_image : Base64 kodlanmış görüntü (JPEG/PNG)
            prompt       : Görüntü analizi yönergesi
            tenant_id    : Log takibi için tenant kimliği
        """
        if self._dummy_mode:
            logger.debug(
                "Dummy mode (vision) — tenant_id=%s", tenant_id
            )
            return _DUMMY_RESPONSE

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=1, max=10),
                retry=retry_if_exception_type(Exception),
                reraise=True,
            ):
                with attempt:
                    response = await self._client.chat.completions.create(  # type: ignore[union-attr]
                        model=self._model,
                        messages=[
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:image/jpeg;base64,{base64_image}"
                                        },
                                    },
                                ],
                            }
                        ],
                        max_tokens=1500,
                    )

            content = response.choices[0].message.content or ""
            usage = response.usage

            if usage:
                logger.info(
                    "OpenAI vision token kullanımı — tenant_id=%s total_tokens=%d",
                    tenant_id,
                    usage.total_tokens,
                )

            return content

        except Exception as exc:
            logger.error(
                "OpenAI vision API hatası — tenant_id=%s hata=%s",
                tenant_id,
                str(exc),
            )
            raise

    @property
    def is_dummy(self) -> bool:
        """Client dummy modda mı çalışıyor?"""
        return self._dummy_mode
