/**
 * Billing modülüne ait paylaşılan tip tanımları.
 * Backend entity ve frontend servisleri bu tipleri kullanır.
 */

export type BillingPlanTier = 'starter' | 'business' | 'enterprise';

/**
 * Abonelik planı — tek doğruluk kaynağı.
 * Backend `BillingPlan` entity'si ve frontend'in normalize tipi bu interface'i kullanır.
 */
export interface BillingPlan {
  id:               string;           // 'starter' | 'business' | 'enterprise'
  name:             string;
  tier:             BillingPlanTier;
  priceKurus:       number;           // Aylık fiyat (kuruş)
  annualPriceKurus: number;           // Yıllık fiyat (kuruş)
  maxUsers:         number;
  maxInvoicesMonth: number;           // 0 = sınırsız
  hasMl:            boolean;
  hasMarketplace:   boolean;
  hasHr:            boolean;
  features:         string[];
  isActive:         boolean;
}
