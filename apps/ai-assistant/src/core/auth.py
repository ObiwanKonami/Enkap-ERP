"""
Tenant kimlik doğrulama ve bağlam yönetimi.

ml-inference/src/core/tenant_auth.py ile aynı pattern'ı izler;
NestJS auth-service ile aynı JWT secret'ı kullanır.

Token yapısı (JwtPayload):
  sub         : kullanıcı UUID
  tenant_id   : tenant UUID (zorunlu — tüm AI çağrıları tenant bazında)
  jti         : token benzersiz ID (revokasyon için)
  user_roles  : yetki listesi
  tenant_tier : plan seviyesi (starter / business / enterprise)
"""

import logging
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from .config import get_settings

logger = logging.getLogger(__name__)

security = HTTPBearer()


class TenantContext(BaseModel):
    tenant_id: str
    user_id: str
    user_roles: list[str]
    jti: str
    # Tenant plan seviyesi: starter / business / enterprise
    tenant_tier: str = "starter"


def verify_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> TenantContext:
    """
    Bearer token'ı doğrular ve TenantContext döner.
    Geçersiz veya süresi dolmuş token'da 401 fırlatır.
    """
    settings = get_settings()
    token = credentials.credentials

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        logger.warning("JWT doğrulama hatası: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    tenant_id: str | None = payload.get("tenant_id")
    user_id: str | None = payload.get("sub")
    jti: str | None = payload.get("jti")

    if not tenant_id or not user_id or not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token'da zorunlu claim eksik (tenant_id, sub, jti)",
        )

    logger.debug("Token doğrulandı — tenant_id=%s user_id=%s", tenant_id, user_id)

    return TenantContext(
        tenant_id=tenant_id,
        user_id=user_id,
        user_roles=payload.get("user_roles", []),
        jti=jti,
        tenant_tier=payload.get("tenant_tier", "starter"),
    )


def require_ai_feature(ctx: TenantContext) -> None:
    """
    AI asistan özelliğinin tenant planına dahil olup olmadığını kontrol eder.
    Starter plan → 403 Forbidden.
    Business ve enterprise → erişim açık.
    """
    ai_tiers = {"business", "enterprise"}
    if ctx.tenant_tier not in ai_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "AI Muhasebe Asistanı özelliği mevcut planınıza dahil değil. "
                "Business veya Enterprise plana yükseltin."
            ),
        )


# FastAPI dependency alias — router'larda kullanım kolaylığı için
TenantDep = Annotated[TenantContext, Depends(verify_token)]
