"""
Feast Feature Store istemcisi.

Mimari:
  Online store  → Redis (düşük gecikme, gerçek zamanlı inference için)
  Offline store → MinIO / Parquet (eğitim için tarihsel özellikler)

Feature grupları:
  tenant_sales_features   : günlük satış toplamları, 7/30 günlük MA
  tenant_stock_features   : stok seviyeleri, devir hızı
  tenant_financial_features: alacak/borç yaşlandırma, nakit pozisyonu

TODO: Gerçek Feast entegrasyonu — şu an stub döner.
      Feast feature server URL'si: FEAST_ENDPOINT env değişkeni ile konfigüre edilir.
"""

import os
from datetime import date, timedelta
from typing import Any

import httpx

_FEAST_ENDPOINT = os.environ.get("FEAST_ENDPOINT", "http://feast-server:6566")
_USE_STUB = os.environ.get("FEAST_USE_STUB", "true").lower() == "true"


async def get_online_features(
    tenant_id: str,
    feature_refs: list[str],
    entity_rows: list[dict],
) -> list[dict[str, Any]]:
    """
    Feast online store'dan anlık feature'ları çeker.

    Örnek kullanım:
        features = await get_online_features(
            tenant_id="abc-123",
            feature_refs=["tenant_sales_features:daily_revenue_7d_ma"],
            entity_rows=[{"tenant_id": "abc-123"}],
        )
    """
    if _USE_STUB:
        return _stub_online_features(tenant_id, feature_refs)

    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(
            f"{_FEAST_ENDPOINT}/get-online-features",
            json={
                "features": feature_refs,
                "entities": entity_rows,
                "full_feature_names": True,
            },
            headers={"X-Tenant-ID": tenant_id},
        )
        response.raise_for_status()
        return response.json()["results"]


async def get_historical_features(
    tenant_id: str,
    feature_refs: list[str],
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    """
    Feast offline store'dan tarihsel feature'ları çeker (eğitim için).
    Parquet formatında MinIO'dan okunur.

    TODO: Gerçek implementasyon — stub döner.
    """
    if _USE_STUB:
        return _stub_historical_features(tenant_id, start_date, end_date)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_FEAST_ENDPOINT}/get-historical-features",
            json={
                "features": feature_refs,
                "entities": {"tenant_id": [tenant_id]},
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            headers={"X-Tenant-ID": tenant_id},
        )
        response.raise_for_status()
        return response.json()["results"]


# ─── Stub implementasyonlar (geliştirme/test için) ──────────────────────────

def _stub_online_features(tenant_id: str, feature_refs: list[str]) -> list[dict]:
    """
    Gerçekçi rastgele feature değerleri döner.
    Sadece geliştirme ve entegrasyon testlerinde kullanılır.
    """
    import random
    return [
        {
            "tenant_id": tenant_id,
            "daily_revenue_7d_ma": round(random.uniform(50_000, 500_000), 2),
            "daily_revenue_30d_ma": round(random.uniform(45_000, 480_000), 2),
            "order_count_7d": random.randint(10, 200),
            "avg_order_value": round(random.uniform(500, 5000), 2),
            "stock_turnover_30d": round(random.uniform(2.0, 15.0), 2),
            "receivables_overdue_ratio": round(random.uniform(0.05, 0.35), 3),
            "cash_position_kurus": random.randint(1_000_000, 50_000_000),
        }
    ]


def _stub_historical_features(
    tenant_id: str,
    start_date: date,
    end_date: date,
) -> list[dict]:
    """
    90 günlük sahte tarihsel satış verisi döner.
    """
    import random
    result = []
    current = start_date
    while current <= end_date:
        # Hafta sonu etkisi
        weekday = current.weekday()
        base = 100_000 if weekday < 5 else 30_000
        noise = random.gauss(0, base * 0.15)

        result.append({
            "tenant_id": tenant_id,
            "ds": current.isoformat(),  # Prophet ds sütunu
            "y": max(0.0, round(base + noise, 2)),
            "day_of_week": weekday,
            "is_holiday": _is_turkish_holiday(current),
        })
        current += timedelta(days=1)
    return result


def _is_turkish_holiday(d: date) -> bool:
    """Resmi Türk tatillerini kontrol eder (sabit tarihli)."""
    fixed_holidays = {
        (1, 1),   # Yılbaşı
        (4, 23),  # Ulusal Egemenlik ve Çocuk Bayramı
        (5, 1),   # İşçi Bayramı
        (5, 19),  # Atatürk'ü Anma
        (7, 15),  # Demokrasi Bayramı
        (8, 30),  # Zafer Bayramı
        (10, 29), # Cumhuriyet Bayramı
    }
    return (d.month, d.day) in fixed_holidays
