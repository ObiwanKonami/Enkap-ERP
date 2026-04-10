import type { Migration } from '../migration-runner';

/**
 * V066 — crm_contacts tablosuna district kolonu ekle
 *
 * Contact entity'de district alanı tanımlı ancak V001 baseline'da
 * crm_contacts tablosunda bu kolon eksik.
 */
export const V066_AddContactDistrict: Migration = {
  version: 'V066',
  description: 'Add district column to crm_contacts table',
  checksum: 'v066-add-contact-district-20260410',
  sql: `
    ALTER TABLE crm_contacts
      ADD COLUMN IF NOT EXISTS district VARCHAR(100);
  `,
};
