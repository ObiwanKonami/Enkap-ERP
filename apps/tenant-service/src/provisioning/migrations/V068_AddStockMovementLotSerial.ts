import type { Migration } from '../migration-runner';

/**
 * V068 — stock_movements tablosuna lot_number ve serial_number kolonları ekle
 *
 * Lot/seri numarası takibi: farmasötik, gıda, elektronik gibi
 * traceability gerektiren ürünler için zorunludur.
 * Her iki alan nullable — sadece takip gereken ürünlerde dolu olur.
 */
export const V068_AddStockMovementLotSerial: Migration = {
  version: 'V068',
  description: 'Add lot_number and serial_number columns to stock_movements table',
  checksum: 'v068-add-stock-movement-lot-serial-20260410',
  sql: `
    ALTER TABLE stock_movements
      ADD COLUMN IF NOT EXISTS lot_number    VARCHAR(50)  NULL,
      ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100) NULL;

    COMMENT ON COLUMN stock_movements.lot_number    IS 'Lot/parti numarası — farmasötik, gıda, kimyasal ürünler için';
    COMMENT ON COLUMN stock_movements.serial_number IS 'Seri numarası — elektronik, ekipman gibi bireysel takip için';
  `,
};
