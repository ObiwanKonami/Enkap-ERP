import type { Migration } from '../migration-runner';

/**
 * V065 — Sefer tablosuna kargo ağırlığı ve hacim kolonları ekle
 *
 * trips.cargo_weight_kg : planlanan kargo ağırlığı (kg)
 * trips.cargo_volume_m3 : planlanan kargo hacmi (m³)
 *
 * Bu değerler sefer oluşturulurken kaydedilir ve kapasite kontrolünde kullanılır.
 */
export const V065_AddTripCargoColumns: Migration = {
  version: 'V065',
  description: 'Add cargo_weight_kg and cargo_volume_m3 columns to trips table',
  checksum: 'v065-add-trip-cargo-columns-20260410',
  sql: `
    ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS cargo_weight_kg NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS cargo_volume_m3  NUMERIC(10,2);
  `,
};
