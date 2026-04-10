"""
ML Model Drift Tespiti — PSI (Population Stability Index) Tabanlı.

PSI Yorumlama Rehberi:
  PSI < 0.1  → Anlamsız değişim (model stabil)
  PSI 0.1-0.2 → Orta değişim (izle)
  PSI > 0.2  → Ciddi drift → retraining tetikle

Referans: Siddiqi (2006), "Credit Risk Scorecards", John Wiley & Sons.

Kullanım:
  detector = DriftDetector()
  result = detector.compute_psi(reference_data, production_data)
  if result.psi > 0.2:
      trigger_retraining(tenant_id, model_type)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

# PSI eşikleri
PSI_LOW_THRESHOLD    = 0.1   # Stabil
PSI_MEDIUM_THRESHOLD = 0.2   # İzle
# PSI > 0.2 → kritik drift → retraining

# Skor düzeyinde doğruluk eşiği (MAPE)
MAPE_DEGRADATION_THRESHOLD = 0.05  # %5 bozulma → drift sinyali


@dataclass
class BucketDrift:
    bucket_index:      int
    reference_pct:     float    # Referans dağılımındaki yüzde
    production_pct:    float    # Production dağılımındaki yüzde
    psi_contribution:  float    # Bu bucket'ın PSI katkısı


@dataclass
class DriftResult:
    model_type:   str
    tenant_id:    str
    psi:          float
    status:       str           # 'stable' | 'warning' | 'critical'
    buckets:      list[BucketDrift] = field(default_factory=list)
    mape_drift:   float | None  = None  # MAPE bazlı ek sinyal
    needs_retrain: bool          = False
    details:      dict           = field(default_factory=dict)

    def __post_init__(self):
        if self.psi >= PSI_MEDIUM_THRESHOLD:
            self.status = 'critical'
            self.needs_retrain = True
        elif self.psi >= PSI_LOW_THRESHOLD:
            self.status = 'warning'
        else:
            self.status = 'stable'


class DriftDetector:
    """
    PSI tabanlı model drift tespiti.

    Referans dağılımı: modelin eğitildiği dönemin tahmin dağılımı.
    Production dağılımı: son N günün tahmin dağılımı.
    """

    def compute_psi(
        self,
        reference_scores: list[float],
        production_scores: list[float],
        model_type: str,
        tenant_id: str,
        n_buckets: int = 10,
    ) -> DriftResult:
        """
        Population Stability Index hesaplar.

        :param reference_scores:  Referans döneminin tahmin değerleri
        :param production_scores: Canlı ortamın tahmin değerleri
        :param n_buckets:         Eşit genişlikli bucket sayısı (varsayılan 10)
        """
        if len(reference_scores) < 30 or len(production_scores) < 30:
            logger.warning(
                "PSI hesabı için yetersiz veri: ref=%d prod=%d",
                len(reference_scores), len(production_scores),
            )
            return DriftResult(
                model_type=model_type,
                tenant_id=tenant_id,
                psi=0.0,
                status='stable',
                details={'warning': 'Yetersiz veri — PSI hesaplanamadı'},
            )

        ref  = np.array(reference_scores, dtype=float)
        prod = np.array(production_scores, dtype=float)

        # Referans veriye göre bucket sınırlarını belirle
        breakpoints = np.percentile(ref, np.linspace(0, 100, n_buckets + 1))
        breakpoints = np.unique(breakpoints)  # Tekrar eden değerleri temizle

        if len(breakpoints) < 3:
            # Tüm değerler aynı — drift hesaplanamaz
            return DriftResult(
                model_type=model_type,
                tenant_id=tenant_id,
                psi=0.0,
                status='stable',
                details={'warning': 'Tek tip dağılım — PSI sıfır'},
            )

        buckets: list[BucketDrift] = []
        psi_total = 0.0
        n_buckets_actual = len(breakpoints) - 1

        for i in range(n_buckets_actual):
            lo, hi = breakpoints[i], breakpoints[i + 1]
            is_last = (i == n_buckets_actual - 1)

            if is_last:
                ref_count  = np.sum((ref  >= lo) & (ref  <= hi))
                prod_count = np.sum((prod >= lo) & (prod <= hi))
            else:
                ref_count  = np.sum((ref  >= lo) & (ref  < hi))
                prod_count = np.sum((prod >= lo) & (prod < hi))

            # Sıfırdan kaçın (log hesabı için epsilon)
            ref_pct  = max(ref_count  / len(ref),  1e-6)
            prod_pct = max(prod_count / len(prod), 1e-6)

            contribution = (prod_pct - ref_pct) * math.log(prod_pct / ref_pct)
            psi_total += contribution

            buckets.append(BucketDrift(
                bucket_index=i,
                reference_pct=ref_pct,
                production_pct=prod_pct,
                psi_contribution=contribution,
            ))

        result = DriftResult(
            model_type=model_type,
            tenant_id=tenant_id,
            psi=round(psi_total, 4),
            status='stable',   # __post_init__ günceller
            buckets=buckets,
            details={
                'n_reference':  len(reference_scores),
                'n_production': len(production_scores),
                'n_buckets':    n_buckets_actual,
            },
        )

        logger.info(
            "PSI hesaplandı: tenant=%s model=%s psi=%.4f status=%s",
            tenant_id, model_type, result.psi, result.status,
        )

        return result

    def check_mape_drift(
        self,
        baseline_mape: float,
        current_mape:  float,
        model_type:    str,
        tenant_id:     str,
    ) -> bool:
        """
        MAPE bazlı doğruluk bozulması kontrolü.

        :return: True → ciddi bozulma, retraining gerekli
        """
        degradation = current_mape - baseline_mape

        if degradation > MAPE_DEGRADATION_THRESHOLD:
            logger.warning(
                "MAPE bozulması tespit edildi: tenant=%s model=%s baseline=%.3f current=%.3f degradation=%.3f",
                tenant_id, model_type, baseline_mape, current_mape, degradation,
            )
            return True

        return False
