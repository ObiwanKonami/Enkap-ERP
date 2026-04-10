import type { Migration } from '../migration-runner';

/**
 * V064 — Fleet enum değerlerini entity'lerle uyumlu hale getir
 *
 * Sorun: V001 baseline'da vehicles.type/status ve drivers.status
 * check constraint'leri İngilizce değerler kullanıyordu
 * (TRUCK/active), fakat TypeScript entity'leri Türkçe değerler
 * kullanıyor (KAMYON/AKTIF).
 *
 * Ayrıca vehicles.vehicle_number NOT NULL tanımlı ama entity'de yok.
 */
export const V064_FixFleetEnums: Migration = {
  version: 'V064',
  description: 'Fix fleet enum values: vehicles/drivers type+status to Turkish, vehicle_number nullable',
  checksum: 'v064-fix-fleet-enums-20260409',
  sql: `
    -- 1. vehicles.vehicle_number: NOT NULL kısıtını kaldır
    ALTER TABLE vehicles ALTER COLUMN vehicle_number DROP NOT NULL;

    -- 2. vehicles.type: İngilizce → Türkçe
    ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_type_check;
    UPDATE vehicles SET type = CASE type
      WHEN 'TRUCK'      THEN 'KAMYON'
      WHEN 'VAN'        THEN 'KAMYONET'
      WHEN 'CAR'        THEN 'DIGER'
      WHEN 'MOTORCYCLE' THEN 'DIGER'
      WHEN 'OTHER'      THEN 'DIGER'
      ELSE type
    END WHERE type IN ('TRUCK','VAN','CAR','MOTORCYCLE','OTHER');
    ALTER TABLE vehicles ADD CONSTRAINT vehicles_type_check
      CHECK (type IN ('TIR','KAMYON','KAMYONET','PICKUP','FORKLIFT','DIGER'));

    -- 3. vehicles.status: İngilizce → Türkçe
    ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
    UPDATE vehicles SET status = CASE status
      WHEN 'active'      THEN 'AKTIF'
      WHEN 'maintenance' THEN 'BAKIMDA'
      WHEN 'inactive'    THEN 'PASIF'
      ELSE status
    END WHERE status IN ('active','maintenance','inactive');
    ALTER TABLE vehicles ALTER COLUMN status SET DEFAULT 'AKTIF';
    ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_check
      CHECK (status IN ('AKTIF','PASIF','BAKIMDA'));

    -- 4. drivers.status: İngilizce → Türkçe
    ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
    UPDATE drivers SET status = CASE status
      WHEN 'active'    THEN 'AKTIF'
      WHEN 'inactive'  THEN 'PASIF'
      WHEN 'suspended' THEN 'PASIF'
      ELSE status
    END WHERE status IN ('active','inactive','suspended');
    ALTER TABLE drivers ALTER COLUMN status SET DEFAULT 'AKTIF';
    ALTER TABLE drivers ADD CONSTRAINT drivers_status_check
      CHECK (status IN ('AKTIF','PASIF','IZINDE'));
  `,
};
