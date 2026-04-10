"""
Ham veriden ML özellikleri çıkarımı.

Bu servis Feast'e veri yazmadan önce uygulama katmanında özellik
mühendisliği yapar. Feast offline store'da saklanan feature'lar
bu servis çıktısından üretilir.

Özellik grupları:
  1. Satış özellikleri: gecikme, hareketli ortalama, büyüme hızı
  2. Nakit akışı: giriş/çıkış oranı, nakit dönüşüm döngüsü
  3. Stok: devir hızı, SKU başına günlük satış
  4. Alacak/Borç: yaşlandırma buckets, gecikme oranları
  5. Takvim: Türkiye'ye özgü tatil, ay sonu, çeyrek sonu
"""

from datetime import date, timedelta
from typing import Any

import numpy as np


def build_sales_features(
    daily_sales: list[dict],
    reference_date: date | None = None,
) -> list[dict]:
    """
    Günlük satış geçmişinden ML özellik matrisi oluşturur.

    Girdi:
        [{"ds": "2026-01-01", "y": 125000.0}, ...]

    Çıktı:
        [{"ds": ..., "lag_1": ..., "lag_7": ..., "ma_7": ..., ...}, ...]
    """
    if not daily_sales:
        return []

    # Tarihe göre sırala
    sorted_data = sorted(daily_sales, key=lambda r: r["ds"])
    values = [float(row["y"]) for row in sorted_data]
    dates = [row["ds"] for row in sorted_data]

    result = []
    for i, (ds, y) in enumerate(zip(dates, values)):
        row_date = date.fromisoformat(ds) if isinstance(ds, str) else ds

        # Gecikme özellikleri
        lag_1  = values[i - 1]  if i >= 1  else 0.0
        lag_7  = values[i - 7]  if i >= 7  else 0.0
        lag_14 = values[i - 14] if i >= 14 else 0.0
        lag_30 = values[i - 30] if i >= 30 else 0.0

        # Hareketli ortalamalar
        ma_7  = float(np.mean(values[max(0, i - 6):i + 1]))
        ma_14 = float(np.mean(values[max(0, i - 13):i + 1]))
        ma_30 = float(np.mean(values[max(0, i - 29):i + 1]))

        # Haftalık büyüme hızı
        growth_7d = (y - lag_7) / (lag_7 + 1e-6) if i >= 7 else 0.0

        # Standart sapma (volatilite)
        std_7 = float(np.std(values[max(0, i - 6):i + 1])) if i >= 1 else 0.0

        result.append({
            "ds": ds,
            "y": y,
            "lag_1": lag_1,
            "lag_7": lag_7,
            "lag_14": lag_14,
            "lag_30": lag_30,
            "ma_7": ma_7,
            "ma_14": ma_14,
            "ma_30": ma_30,
            "growth_7d": growth_7d,
            "std_7": std_7,
            "day_of_week": row_date.weekday(),
            "month": row_date.month,
            "day_of_month": row_date.day,
            "is_weekend": int(row_date.weekday() >= 5),
            "is_month_end": int(row_date.day >= 28),
            "is_quarter_end": int(
                row_date.month in (3, 6, 9, 12) and row_date.day >= 28
            ),
            "is_holiday": int(_is_turkish_holiday(row_date)),
        })

    return result


def build_cashflow_features(
    daily_cashflow: list[dict],
) -> list[dict]:
    """
    Günlük nakit akışı verilerinden özellik matrisi oluşturur.

    Girdi:
        [{"ds": "...", "inflow": 200000.0, "outflow": 150000.0}, ...]

    Çıktı — ek özellikler:
        net, inflow_ma_7, outflow_ma_7, cash_conversion_proxy, inflow_outflow_ratio
    """
    if not daily_cashflow:
        return []

    sorted_data = sorted(daily_cashflow, key=lambda r: r["ds"])
    inflows = [float(row.get("inflow", 0)) for row in sorted_data]
    outflows = [float(row.get("outflow", 0)) for row in sorted_data]

    result = []
    for i, row in enumerate(sorted_data):
        inflow = inflows[i]
        outflow = outflows[i]
        net = inflow - outflow

        inflow_ma_7  = float(np.mean(inflows[max(0, i - 6):i + 1]))
        outflow_ma_7 = float(np.mean(outflows[max(0, i - 6):i + 1]))

        ratio = inflow / (outflow + 1e-6)

        ds = row["ds"]
        row_date = date.fromisoformat(ds) if isinstance(ds, str) else ds

        result.append({
            "ds": ds,
            "inflow": inflow,
            "outflow": outflow,
            "net": net,
            "inflow_ma_7": inflow_ma_7,
            "outflow_ma_7": outflow_ma_7,
            "inflow_outflow_ratio": round(ratio, 4),
            "day_of_week": row_date.weekday(),
            "month": row_date.month,
            "is_month_end": int(row_date.day >= 28),
        })

    return result


def build_anomaly_features(raw_metrics: list[dict]) -> list[dict]:
    """
    Anomali tespiti için çok boyutlu özellik matrisi oluşturur.

    Beklenen metrikler (hepsi opsiyonel, eksik → 0):
      daily_revenue, daily_expense, receivables_overdue,
      payables_overdue, stock_turnover, avg_order_value,
      payment_delay_days, refund_rate
    """
    expected_fields = [
        "daily_revenue", "daily_expense", "receivables_overdue",
        "payables_overdue", "stock_turnover", "avg_order_value",
        "payment_delay_days", "refund_rate",
    ]

    result = []
    for row in raw_metrics:
        feature_row: dict[str, Any] = {"ds": row["ds"]}
        for field in expected_fields:
            feature_row[field] = float(row.get(field, 0.0))

        # Türetilmiş özellikler
        rev = feature_row["daily_revenue"]
        exp = feature_row["daily_expense"]
        feature_row["expense_revenue_ratio"] = exp / (rev + 1e-6)
        feature_row["profit_margin"] = (rev - exp) / (rev + 1e-6)

        result.append(feature_row)

    return result


def _is_turkish_holiday(d: date) -> bool:
    """Sabit tarihli Türk resmi tatillerini kontrol eder."""
    fixed = {
        (1, 1), (4, 23), (5, 1), (5, 19),
        (7, 15), (8, 30), (10, 29),
    }
    return (d.month, d.day) in fixed
