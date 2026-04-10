/**
 * Plan bazlı özellik kapıları.
 *
 * Her özellik belirli bir minimum plana bağlıdır.
 * @RequiresPlan(Feature.ML) → business veya enterprise gerektirir.
 */
export enum Feature {
  /** Yapay zeka tahminleme (XGBoost, Prophet, anomali) — Business+ */
  ML = 'ml',

  /** Trendyol, Hepsiburada marketplace entegrasyonu — Business+ */
  MARKETPLACE = 'marketplace',

  /** İK ve bordro modülü (HR, Payroll) — Business+ */
  HR = 'hr',

  /** CRM: kişi, fırsat, aktivite — Business+ */
  CRM = 'crm',

  /** White label ve özel domain — Enterprise */
  WHITE_LABEL = 'white_label',
}

/** Hangi plan hangi özelliklere sahip */
export const PLAN_FEATURES: Record<string, Feature[]> = {
  starter: [Feature.HR, Feature.CRM],
  business: [Feature.ML, Feature.MARKETPLACE, Feature.HR, Feature.CRM],
  enterprise: [
    Feature.ML,
    Feature.MARKETPLACE,
    Feature.HR,
    Feature.CRM,
    Feature.WHITE_LABEL,
  ],
};
