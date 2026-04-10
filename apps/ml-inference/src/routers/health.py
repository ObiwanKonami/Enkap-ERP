"""Sağlık kontrolü endpoint'leri."""

import os
from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health_check():
    """Temel liveness probe."""
    return {
        "status": "ok",
        "service": "enkap-ml-inference",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": os.environ.get("APP_VERSION", "0.1.0"),
    }


@router.get("/ready")
async def readiness_check():
    """
    Readiness probe — bağımlılık servislerini kontrol eder.
    Kubernetes readinessProbe için kullanılır.
    """
    checks: dict[str, str] = {}

    # Redis kontrolü
    try:
        from ..core.redis_client import get_client
        client = get_client()
        await client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    all_ok = all(v == "ok" for v in checks.values())

    return {
        "status": "ready" if all_ok else "degraded",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
