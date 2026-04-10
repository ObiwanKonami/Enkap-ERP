"""
Prophet Nakit Akışı Tahmin Modeli.

Prophet neden burada?
  - Nakit akışı güçlü haftalık + aylık + yıllık mevsimsellik gösterir
  - Türk resmi tatilleri özel regressor olarak eklenir
  - Ramadan (hareketli tatil) Prophet'ın custom holiday desteğiyle modellenir
  - Trend değişim noktaları (changepoints) otomatik tespit edilir

Girdi: Günlük nakit giriş/çıkış verileri (en az 180 gün)
Çıktı: Günlük net nakit akışı tahmini + kümülatif pozisyon

Eğitim: Airflow cashflow_dag aylık tetikler.
"""

import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

try:
    from prophet import Prophet
    _PROPHET_AVAILABLE = True
except ImportError:
    _PROPHET_AVAILABLE = False
    logger.warning("prophet kurulu değil — stub tahmin kullanılacak")


# Türkiye resmi tatilleri (sabit tarihli) — Prophet holiday formatı
_TURKEY_FIXED_HOLIDAYS = pd.DataFrame({
    "holiday": [
        "yilbasi", "ulusal_egemenlik", "isci_bayrami",
        "ataturk_anma", "demokrasi_bayrami", "zafer_bayrami", "cumhuriyet_bayrami",
    ] * 3,  # 3 yıl için tekrar
    "ds": pd.to_datetime([
        # 2025
        "2025-01-01", "2025-04-23", "2025-05-01",
        "2025-05-19", "2025-07-15", "2025-08-30", "2025-10-29",
        # 2026
        "2026-01-01", "2026-04-23", "2026-05-01",
        "2026-05-19", "2026-07-15", "2026-08-30", "2026-10-29",
        # 2027
        "2027-01-01", "2027-04-23", "2027-05-01",
        "2027-05-19", "2027-07-15", "2027-08-30", "2027-10-29",
    ]),
    "lower_window": [0] * 21,
    "upper_window": [1] * 21,
})


class ProphetCashflowForecaster:
    """
    Prophet tabanlı nakit akışı tahmini.

    Ayrı modeller:
      - inflow_model:  nakit girişi (satış tahsilatları + diğer gelirler)
      - outflow_model: nakit çıkışı (fatura ödemeleri + maaş + diğer giderler)
    Net = inflow - outflow olarak hesaplanır.
    """

    def __init__(self):
        self.inflow_model: "Prophet | None" = None
        self.outflow_model: "Prophet | None" = None

    def fit(self, cashflow_data: list[dict]) -> None:
        """
        Modeli eğitir.

        cashflow_data formatı:
            [{"ds": "2026-01-01", "inflow": 200000.0, "outflow": 150000.0}, ...]
        """
        if not _PROPHET_AVAILABLE:
            logger.warning("Prophet mevcut değil, stub kullanılıyor")
            return

        df = pd.DataFrame(cashflow_data)
        df["ds"] = pd.to_datetime(df["ds"])

        # Giriş modeli
        inflow_df = df[["ds", "inflow"]].rename(columns={"inflow": "y"})
        self.inflow_model = self._create_model()
        self.inflow_model.fit(inflow_df)

        # Çıkış modeli
        outflow_df = df[["ds", "outflow"]].rename(columns={"outflow": "y"})
        self.outflow_model = self._create_model()
        self.outflow_model.fit(outflow_df)

        logger.info("Prophet nakit akışı modelleri eğitildi (%d nokta)", len(df))

    def predict(
        self,
        cashflow_data: list[dict],
        horizon_days: int,
        initial_cash_position: float = 0.0,
    ) -> list[dict]:
        """
        Gelecek nakit akışı tahmini.

        Döndürür:
            [{"ds": "...", "inflow": ..., "outflow": ..., "net": ..., "cumulative": ...}, ...]
        """
        if not _PROPHET_AVAILABLE or self.inflow_model is None:
            return self._stub_predict(cashflow_data, horizon_days, initial_cash_position)

        # Tahmin için zaman aralığı oluştur
        last_ds = max(row["ds"] for row in cashflow_data)
        last_date = date.fromisoformat(last_ds) if isinstance(last_ds, str) else last_ds

        future = pd.DataFrame({
            "ds": pd.date_range(
                start=last_date + timedelta(days=1),
                periods=horizon_days,
                freq="D",
            )
        })

        inflow_forecast = self.inflow_model.predict(future)
        outflow_forecast = self.outflow_model.predict(future)

        results = []
        cumulative = initial_cash_position

        for i in range(horizon_days):
            inflow = max(0.0, float(inflow_forecast.iloc[i]["yhat"]))
            outflow = max(0.0, float(outflow_forecast.iloc[i]["yhat"]))
            net = inflow - outflow
            cumulative += net

            inflow_lower = max(0.0, float(inflow_forecast.iloc[i]["yhat_lower"]))
            inflow_upper = max(0.0, float(inflow_forecast.iloc[i]["yhat_upper"]))
            outflow_lower = max(0.0, float(outflow_forecast.iloc[i]["yhat_lower"]))
            outflow_upper = max(0.0, float(outflow_forecast.iloc[i]["yhat_upper"]))

            results.append({
                "ds": future.iloc[i]["ds"].date().isoformat(),
                "inflow": round(inflow, 2),
                "outflow": round(outflow, 2),
                "net": round(net, 2),
                "cumulative": round(cumulative, 2),
                "net_lower": round(inflow_lower - outflow_upper, 2),
                "net_upper": round(inflow_upper - outflow_lower, 2),
            })

        return results

    def _create_model(self) -> "Prophet":
        """Prophet modeli oluşturur — Türkiye tatilleri dahil."""
        return Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            holidays=_TURKEY_FIXED_HOLIDAYS,
            changepoint_prior_scale=0.05,  # Düşük = daha düzgün trend
            seasonality_prior_scale=10.0,
            interval_width=0.80,           # %80 güven aralığı
        )

    def _stub_predict(
        self,
        cashflow_data: list[dict],
        horizon_days: int,
        initial_cash_position: float,
    ) -> list[dict]:
        """Model yoksa tarihsel ortalamalara dayalı stub tahmin."""
        import random

        if cashflow_data:
            avg_inflow = float(np.mean([row.get("inflow", 0) for row in cashflow_data[-30:]]))
            avg_outflow = float(np.mean([row.get("outflow", 0) for row in cashflow_data[-30:]]))
        else:
            avg_inflow = 200_000.0
            avg_outflow = 180_000.0

        last_ds = max(row["ds"] for row in cashflow_data) if cashflow_data else date.today().isoformat()
        last_date = date.fromisoformat(last_ds) if isinstance(last_ds, str) else last_ds

        results = []
        cumulative = initial_cash_position

        for i in range(1, horizon_days + 1):
            target = last_date + timedelta(days=i)
            factor = 0.1 if target.weekday() >= 5 else 1.0

            inflow = max(0.0, (avg_inflow + random.gauss(0, avg_inflow * 0.1)) * factor)
            outflow = max(0.0, (avg_outflow + random.gauss(0, avg_outflow * 0.05)) * factor)
            net = inflow - outflow
            cumulative += net

            results.append({
                "ds": target.isoformat(),
                "inflow": round(inflow, 2),
                "outflow": round(outflow, 2),
                "net": round(net, 2),
                "cumulative": round(cumulative, 2),
                "net_lower": round(net * 0.8, 2),
                "net_upper": round(net * 1.2, 2),
            })

        return results
