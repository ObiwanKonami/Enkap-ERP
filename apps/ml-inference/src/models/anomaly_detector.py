"""
Isolation Forest Finansal Anomali Tespit Modeli.

Neden Isolation Forest?
  - Etiketsiz veri (denetimsiz öğrenme) — her tenant için farklı "normal" davranış
  - Yüksek boyutlu: gelir, harcama, alacak yaşlandırma, stok hızı, ödeme gecikmesi
  - Hızlı: O(n log n) eğitim, O(log n) inference
  - Küçük dataset'te iyi performans (Türk KOBİ verisi genellikle sınırlı)

Anomali skoru:
  score < -0.5 → yüksek şiddet
  -0.5 ≤ score < -0.2 → orta şiddet
  score ≥ -0.2 → düşük şiddet (borderline)

contamination parametresi: beklenen anomali oranı (varsayılan %5).
"""

import logging
from datetime import date

import numpy as np

logger = logging.getLogger(__name__)

try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn kurulu değil — stub anomali tespiti kullanılacak")


# Anomali tespitinde kullanılan metrik adları (Türkçe açıklama)
METRIC_LABELS_TR: dict[str, str] = {
    "daily_revenue": "Günlük Gelir",
    "daily_expense": "Günlük Gider",
    "receivables_overdue": "Vadesi Geçmiş Alacak",
    "payables_overdue": "Vadesi Geçmiş Borç",
    "stock_turnover": "Stok Devir Hızı",
    "avg_order_value": "Ortalama Sipariş Tutarı",
    "payment_delay_days": "Ortalama Ödeme Gecikme Günü",
    "refund_rate": "İade Oranı",
}


class IsolationForestDetector:
    """
    Tenant bazında finansal anomali tespiti.

    Her tenant ayrı bir model örneğine sahip olabilir
    (model_registry'de tenant_id ile saklanır).
    """

    def __init__(self, contamination: float = 0.05, n_estimators: int = 100):
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.model: "IsolationForest | None" = None
        self.scaler: "StandardScaler | None" = None
        self.feature_names: list[str] = []

    def fit(self, data: list[dict]) -> None:
        """
        Modeli eğitir.

        data formatı:
            [{"ds": "2026-01-01", "daily_revenue": 125000, "daily_expense": 90000, ...}, ...]
        """
        if not _SKLEARN_AVAILABLE or len(data) < 30:
            logger.warning(
                "sklearn mevcut değil veya yetersiz veri (%d kayıt < 30) — model eğitilmedi",
                len(data),
            )
            return

        self.feature_names = [k for k in data[0].keys() if k != "ds"]
        X = np.array([[row.get(f, 0.0) for f in self.feature_names] for row in data])

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        self.model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X_scaled)
        logger.info("Isolation Forest eğitildi: %d nokta, %d özellik", len(data), len(self.feature_names))

    def predict(self, data: list[dict]) -> list[dict]:
        """
        Anomali tespiti yapar.

        Döndürür:
            [{"ds": "...", "is_anomaly": bool, "score": float, "severity": str}, ...]
        """
        if not _SKLEARN_AVAILABLE or self.model is None:
            return self._stub_predict(data)

        features = [k for k in data[0].keys() if k != "ds"]
        X = np.array([[row.get(f, 0.0) for f in features] for row in data])

        if self.scaler:
            X = self.scaler.transform(X)

        raw_scores = self.model.decision_function(X)  # yüksek = normal
        predictions = self.model.predict(X)            # -1 = anomali, 1 = normal

        # Skoru -1..0 aralığına normalize et
        norm_scores = self._normalize_scores(raw_scores)

        results = []
        for i, row in enumerate(data):
            is_anomaly = predictions[i] == -1
            score = norm_scores[i]
            severity = self._severity(score) if is_anomaly else "normal"

            results.append({
                "ds": row["ds"],
                "is_anomaly": is_anomaly,
                "score": float(score),
                "severity": severity,
                "metrics": {k: row.get(k, 0.0) for k in features},
            })

        return results

    def _normalize_scores(self, raw_scores: np.ndarray) -> np.ndarray:
        """
        IsolationForest decision_function çıktısını -1..0 aralığına normalize eder.
        0 = kesinlikle normal, -1 = kesinlikle anomali.
        """
        min_s, max_s = raw_scores.min(), raw_scores.max()
        if max_s == min_s:
            return np.zeros_like(raw_scores)
        return -1.0 + (raw_scores - min_s) / (max_s - min_s)

    def _severity(self, score: float) -> str:
        """Normalize edilmiş skora göre şiddet seviyesi belirler."""
        if score < -0.5:
            return "yüksek"
        elif score < -0.2:
            return "orta"
        return "düşük"

    def _stub_predict(self, data: list[dict]) -> list[dict]:
        """Model yoksa rastgele %5 anomali işaretle (test için)."""
        import random
        results = []
        for row in data:
            is_anomaly = random.random() < self.contamination
            score = random.uniform(-0.8, -0.5) if is_anomaly else random.uniform(-0.1, 0.0)
            results.append({
                "ds": row["ds"],
                "is_anomaly": is_anomaly,
                "score": round(score, 4),
                "severity": self._severity(score) if is_anomaly else "normal",
                "metrics": {k: row.get(k, 0.0) for k in row if k != "ds"},
            })
        return results
