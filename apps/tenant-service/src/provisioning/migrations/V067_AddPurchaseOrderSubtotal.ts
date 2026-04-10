import type { Migration } from '../migration-runner';

/**
 * V067 — purchase_orders tablosuna subtotal_kurus kolonu ekle
 *
 * PurchaseOrder entity'de subtotalKurus alanı tanımlı ancak
 * baseline'da bu kolon eksikti; kdv_kurus ve total_kurus vardı.
 * Mevcut kayıtlar için subtotal = total - kdv olarak backfill edilir.
 */
export const V067_AddPurchaseOrderSubtotal: Migration = {
  version: 'V067',
  description: 'Add subtotal_kurus column to purchase_orders table',
  checksum: 'v067-add-purchase-order-subtotal-20260410',
  sql: `
    ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS subtotal_kurus BIGINT NOT NULL DEFAULT 0;

    -- Mevcut kayıtlar için backfill: subtotal = total - kdv
    UPDATE purchase_orders
       SET subtotal_kurus = total_kurus - kdv_kurus
     WHERE subtotal_kurus = 0
       AND total_kurus > 0;
  `,
};
