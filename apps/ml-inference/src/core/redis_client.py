"""
Redis bağlantı yönetimi.

Kullanım alanları:
  1. Tahmin önbelleği: aynı tenant + parametre için 1 saatlik önbellek
  2. Feature store online katmanı: Feast → Redis (düşük gecikme)
  3. Model metadata: hangi model versiyonu aktif (MLflow tag)

Bağlantı havuzu: redis-py >= 5.0 asyncio desteği ile.
"""

import json
import os
from typing import Any

import redis.asyncio as aioredis

_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# Uygulama başlangıcında oluşturulan singleton bağlantı havuzu
_pool: aioredis.ConnectionPool | None = None


def get_pool() -> aioredis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            _REDIS_URL,
            max_connections=20,
            decode_responses=True,
        )
    return _pool


def get_client() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=get_pool())

# Alias — geriye dönük uyumluluk
get_redis = get_client


async def cache_get(key: str) -> Any | None:
    """Önbellekten değer al. Yoksa None döner."""
    client = get_client()
    raw = await client.get(key)
    if raw is None:
        return None
    return json.loads(raw)


async def cache_set(key: str, value: Any, ttl_seconds: int = 3600) -> None:
    """Değeri önbelleğe yaz. Varsayılan TTL: 1 saat."""
    client = get_client()
    await client.setex(key, ttl_seconds, json.dumps(value, default=str))


async def cache_delete(key: str) -> None:
    """Önbellekten sil (model yeniden eğitilince tetiklenir)."""
    client = get_client()
    await client.delete(key)


async def invalidate_tenant_predictions(tenant_id: str) -> int:
    """
    Bir tenant'a ait tüm tahmin önbelleklerini siler.
    Model yeniden eğitildiğinde Airflow DAG'dan çağrılır.
    """
    client = get_client()
    pattern = f"pred:{tenant_id}:*"
    keys = await client.keys(pattern)
    if keys:
        return await client.delete(*keys)
    return 0


def make_cache_key(tenant_id: str, model: str, params: dict) -> str:
    """
    Deterministik önbellek anahtarı üretir.
    Parametre sırası önemli değil (sorted ile normalize edilir).
    """
    sorted_params = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"pred:{tenant_id}:{model}:{sorted_params}"
