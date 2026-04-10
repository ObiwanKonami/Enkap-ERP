"""
Tenant kimlik doğrulama ve bağlam yönetimi.

NestJS auth-service ile aynı JWT secret'ı kullanır.
Servis mesh (Istio mTLS) doğrulandıktan sonra bu JWT doğrulaması
uygulama seviyesi ek güvencedir.

Token yapısı (JwtPayload):
  sub        : kullanıcı UUID
  tenant_id  : tenant UUID (zorunlu — tüm ML tahminleri tenant bazında)
  jti        : token benzersiz ID (revokasyon için)
  user_roles : yetki listesi
"""

import os
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

_JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production")
_JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")

security = HTTPBearer()


class TenantContext(BaseModel):
    tenant_id: str
    user_id: str
    user_roles: list[str]
    jti: str
    tenant_tier: str = "starter"  # "starter" | "business" | "enterprise"


def verify_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> TenantContext:
    """
    Bearer token'ı doğrular ve TenantContext döner.
    Geçersiz veya süresi dolmuş token'da 401 fırlatır.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except JWTError as exc:
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

    return TenantContext(
        tenant_id=tenant_id,
        user_id=user_id,
        user_roles=payload.get("user_roles", []),
        jti=jti,
        tenant_tier=payload.get("tenant_tier", "starter"),
    )


def require_ml_feature(ctx: "TenantContext") -> None:
    """
    ML özelliğinin tenant'ın planına dahil olup olmadığını kontrol eder.
    starter plan → 403 ForbiddenException.
    business ve enterprise → erişim açık.
    """
    ml_tiers = {"business", "enterprise"}
    if ctx.tenant_tier not in ml_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ML tahminleme özelliği mevcut planınıza dahil değil. Business veya Enterprise plana yükseltin.",
        )


# FastAPI dependency alias — router'larda kullanım kolaylığı için
TenantDep = Annotated[TenantContext, Depends(verify_token)]
