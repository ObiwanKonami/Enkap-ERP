import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { TR_CITIES, TR_DISTRICTS } from './tr-geo.data';

/**
 * Yeni tenant için Türkiye'ye özgü varsayılan verileri yükler.
 *
 * Tohumlanan veriler:
 *  - TDHP (Türkiye Tekdüzen Hesap Planı) — temel hesap ağacı
 *  - KDV oranları (%1, %10, %20 — 2023 sonrası revize)
 *  - 81 il + temsili ilçe verileri
 *  - Varsayılan sistem rolleri (sistem_admin, muhasebeci, depo, satın_alma, salt_okunur)
 *  - Ana depo
 *
 * Her seed işlemi idempotent:
 *  - ON CONFLICT DO NOTHING ile tekrar çalıştırılabilir
 *  - Varolan veriler üzerine yazılmaz
 */
@Injectable()
export class TenantSeeder {
  private readonly logger = new Logger(TenantSeeder.name);

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  async seed(tenantId: string): Promise<void> {
    this.logger.log(`Veri tohumlama başlıyor: tenant=${tenantId}`);

    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    await dataSource.transaction(async (manager) => {
      await this.seedKdvRates(manager, tenantId);
      await this.seedCities(manager, tenantId);
      await this.seedDistricts(manager, tenantId);
      await this.seedTdhpAccounts(manager, tenantId);
      await this.seedDefaultRoles(manager, tenantId);
      await this.seedDefaultWarehouse(manager, tenantId);
    });

    this.logger.log(`Veri tohumlama tamamlandı: tenant=${tenantId}`);
  }

  // ─── Özel tohumlama metodları ────────────────────────────────────────────────

  private async seedKdvRates(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    const rates = [
      { rate: 0,  name: 'KDV Muaf' },
      { rate: 1,  name: 'KDV %1 (Temel Gıda, Tarım)' },
      { rate: 10, name: 'KDV %10 (Gıda, Sağlık, Tekstil)' },
      { rate: 20, name: 'KDV %20 (Genel)' },
    ];

    for (const rate of rates) {
      await manager.query(`
        INSERT INTO kdv_rates (id, tenant_id, rate, name, is_active)
        VALUES (gen_random_uuid(), $1, $2, $3, true)
        ON CONFLICT DO NOTHING
      `, [tenantId, rate.rate, rate.name]);
    }

    this.logger.debug(`KDV oranları yüklendi: ${rates.length} kayıt`);
  }

  private async seedCities(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    // 81 Türkiye ili — plaka koduna göre sıralı
    for (const city of TR_CITIES) {
      await manager.query(`
        INSERT INTO cities (id, tenant_id, name, plate_code)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
      `, [city.id, tenantId, city.name, city.plateCode]);
    }

    this.logger.debug(`İller yüklendi: ${TR_CITIES.length} kayıt`);
  }

  private async seedDistricts(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    // Batch insert — 100'lük gruplara böl
    const BATCH = 100;
    for (let i = 0; i < TR_DISTRICTS.length; i += BATCH) {
      const chunk = TR_DISTRICTS.slice(i, i + BATCH);
      const values = chunk
        .map((_, j) => {
          const base = j * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(', ');
      const params = chunk.flatMap((d) => [tenantId, d.cityId, d.name]);
      await manager.query(
        `INSERT INTO districts (tenant_id, city_id, name)
         VALUES ${values}
         ON CONFLICT DO NOTHING`,
        params,
      );
    }

    this.logger.debug(`İlçeler yüklendi: ${TR_DISTRICTS.length} kayıt`);
  }

  private async seedTdhpAccounts(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    for (const account of TDHP_ACCOUNTS) {
      await manager.query(`
        INSERT INTO accounts (
          id, tenant_id, code, name, type,
          normal_balance, level, is_postable, parent_code, is_active
        )
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true)
        ON CONFLICT (tenant_id, code) DO NOTHING
      `, [
        tenantId,
        account.code,
        account.name,
        account.type,
        account.normalBalance,
        account.level,
        account.isPostable,
        account.parentCode ?? null,
      ]);
    }

    this.logger.debug(`TDHP hesapları yüklendi: ${TDHP_ACCOUNTS.length} kayıt`);
  }

  private async seedDefaultRoles(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    const roles = [
      {
        name: 'sistem_admin',
        description: 'Tüm modüllere tam erişim',
        permissions: ['*'],
        isSystem: true,
      },
      {
        name: 'muhasebeci',
        description: 'Finans ve muhasebe modüllerine tam erişim',
        permissions: [
          'invoice:read', 'invoice:write', 'invoice:approve',
          'account:read', 'account:write',
          'journal:read', 'journal:write',
          'payment:read', 'payment:write',
          'report:read',
        ],
        isSystem: true,
      },
      {
        name: 'depo_sorumlusu',
        description: 'Stok ve depo yönetimine erişim',
        permissions: [
          'product:read', 'product:write',
          'stock:read', 'stock:write',
          'warehouse:read', 'warehouse:write',
          'purchase_order:read',
        ],
        isSystem: true,
      },
      {
        name: 'satin_alma',
        description: 'Satın alma ve tedarikçi yönetimi',
        permissions: [
          'vendor:read', 'vendor:write',
          'purchase_order:read', 'purchase_order:write',
          'product:read',
          'stock:read',
        ],
        isSystem: true,
      },
      {
        name: 'ik_yoneticisi',
        description: 'İK: çalışan, izin, devam ve bordro yönetimi',
        permissions: [
          'employee:read', 'employee:write',
          'payroll:read', 'payroll:write', 'payroll:approve',
          'leave:read', 'leave:write',
          'report:read',
        ],
        isSystem: true,
      },
      {
        name: 'satis_temsilcisi',
        description: 'CRM: kişi, fırsat ve aktivite yönetimi',
        permissions: [
          'contact:read', 'contact:write',
          'lead:read', 'lead:write',
          'activity:read', 'activity:write',
          'invoice:read',
          'product:read',
        ],
        isSystem: true,
      },
      {
        name: 'salt_okunur',
        description: 'Tüm modüllerde yalnızca görüntüleme',
        permissions: [
          'invoice:read', 'account:read', 'journal:read',
          'product:read', 'stock:read', 'report:read',
        ],
        isSystem: true,
      },
    ];

    for (const role of roles) {
      await manager.query(`
        INSERT INTO roles (id, tenant_id, name, description, permissions, is_system)
        VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (tenant_id, name) DO NOTHING
      `, [
        tenantId,
        role.name,
        role.description,
        JSON.stringify(role.permissions),
        role.isSystem,
      ]);
    }

    this.logger.debug(`Varsayılan roller yüklendi: ${roles.length} rol`);
  }

  private async seedDefaultWarehouse(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    await manager.query(`
      INSERT INTO warehouses (id, tenant_id, code, name, is_active)
      VALUES (gen_random_uuid(), $1, 'MERKEZ', 'Merkez Depo', true)
      ON CONFLICT (tenant_id, code) DO NOTHING
    `, [tenantId]);

    this.logger.debug('Varsayılan depo oluşturuldu: MERKEZ');
  }
}

// ─── TDHP (Türkiye Tekdüzen Hesap Planı) ─────────────────────────────────────

interface TdhpAccount {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'MEMORANDUM';
  normalBalance: 'DEBIT' | 'CREDIT';
  level: 1 | 2 | 3;
  isPostable: boolean;
  parentCode?: string;
}

const TDHP_ACCOUNTS: TdhpAccount[] = [
  // ─── 1. SINIF: DÖNEN VARLIKLAR ─────────────────────────────────────────────
  { code: '1', name: 'Dönen Varlıklar', type: 'ASSET', normalBalance: 'DEBIT', level: 1, isPostable: false },
  { code: '10', name: 'Hazır Değerler', type: 'ASSET', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '1' },
  { code: '100', name: 'Kasa', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '10' },
  { code: '102', name: 'Bankalar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '10' },
  { code: '103', name: 'Verilen Çekler ve Ödeme Emirleri (-)', type: 'ASSET', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '10' },
  { code: '108', name: 'Diğer Hazır Değerler', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '10' },

  { code: '11', name: 'Menkul Kıymetler', type: 'ASSET', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '1' },
  { code: '110', name: 'Hisse Senetleri', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '11' },
  { code: '111', name: 'Özel Kesim Tahvil, Senet ve Bonoları', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '11' },
  { code: '112', name: 'Kamu Kesimi Tahvil, Senet ve Bonoları', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '11' },

  { code: '12', name: 'Ticari Alacaklar', type: 'ASSET', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '1' },
  { code: '120', name: 'Alıcılar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '12' },
  { code: '121', name: 'Alacak Senetleri', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '12' },
  { code: '122', name: 'Alacak Senetleri Reeskontu (-)', type: 'ASSET', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '12' },
  { code: '126', name: 'Verilen Depozito ve Teminatlar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '12' },
  { code: '128', name: 'Şüpheli Ticari Alacaklar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '12' },
  { code: '129', name: 'Şüpheli Ticari Alacaklar Karşılığı (-)', type: 'ASSET', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '12' },

  { code: '15', name: 'Stoklar', type: 'ASSET', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '1' },
  { code: '150', name: 'İlk Madde ve Malzeme', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '15' },
  { code: '151', name: 'Yarı Mamul Üretim', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '15' },
  { code: '152', name: 'Mamuller', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '15' },
  { code: '153', name: 'Ticari Mallar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '15' },
  { code: '157', name: 'Diğer Stoklar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '15' },
  { code: '158', name: 'Stok Değer Düşüklüğü Karşılığı (-)', type: 'ASSET', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '15' },

  { code: '19', name: 'Diğer Dönen Varlıklar', type: 'ASSET', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '1' },
  { code: '191', name: 'İndirilecek KDV', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '19' },
  { code: '192', name: 'Diğer KDV', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '19' },
  { code: '193', name: 'Peşin Ödenen Vergi ve Fonlar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '19' },
  { code: '195', name: 'İş Avansları', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '19' },
  { code: '196', name: 'Personel Avansları', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '19' },
  { code: '197', name: 'Sayım ve Tesellüm Noksanları', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '19' },

  // ─── 2. SINIF: DURAN VARLIKLAR ─────────────────────────────────────────────
  { code: '2', name: 'Duran Varlıklar', type: 'ASSET', normalBalance: 'DEBIT', level: 1, isPostable: false },
  { code: '25', name: 'Maddi Duran Varlıklar', type: 'ASSET', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '2' },
  { code: '250', name: 'Arazi ve Arsalar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '251', name: 'Yeraltı ve Yerüstü Düzenleri', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '252', name: 'Binalar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '253', name: 'Tesis, Makine ve Cihazlar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '254', name: 'Taşıtlar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '255', name: 'Demirbaşlar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '257', name: 'Birikmiş Amortismanlar (-)', type: 'ASSET', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '25' },
  { code: '258', name: 'Yapılmakta Olan Yatırımlar', type: 'ASSET', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '25' },

  // ─── 3. SINIF: KISA VADELİ YABANCI KAYNAKLAR ──────────────────────────────
  { code: '3', name: 'Kısa Vadeli Yabancı Kaynaklar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 1, isPostable: false },
  { code: '32', name: 'Ticari Borçlar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '3' },
  { code: '320', name: 'Satıcılar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '32' },
  { code: '321', name: 'Borç Senetleri', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '32' },
  { code: '322', name: 'Borç Senetleri Reeskontu (-)', type: 'LIABILITY', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '32' },
  { code: '326', name: 'Alınan Depozito ve Teminatlar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '32' },

  { code: '33', name: 'Diğer Borçlar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '3' },
  { code: '335', name: 'Personele Borçlar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '33' },
  { code: '336', name: 'Diğer Çeşitli Borçlar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '33' },

  { code: '36', name: 'Ödenecek Vergi ve Yükümlülükler', type: 'LIABILITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '3' },
  { code: '360', name: 'Ödenecek Vergi ve Fonlar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '36' },
  { code: '361', name: 'Ödenecek Sosyal Güvenlik Kesintileri', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '36' },

  { code: '39', name: 'Diğer Kısa Vadeli Yabancı Kaynaklar', type: 'LIABILITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '3' },
  { code: '391', name: 'Hesaplanan KDV', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '39' },
  { code: '392', name: 'Diğer KDV', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '39' },
  { code: '393', name: 'Merkez ve Şubeler Cari Hesabı', type: 'LIABILITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '39' },

  // ─── 5. SINIF: ÖZ KAYNAKLAR ────────────────────────────────────────────────
  { code: '5', name: 'Öz Kaynaklar', type: 'EQUITY', normalBalance: 'CREDIT', level: 1, isPostable: false },
  { code: '50', name: 'Ödenmiş Sermaye', type: 'EQUITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '5' },
  { code: '500', name: 'Sermaye', type: 'EQUITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '50' },
  { code: '501', name: 'Ödenmemiş Sermaye (-)', type: 'EQUITY', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '50' },

  { code: '57', name: 'Geçmiş Yıl Karları/Zararları', type: 'EQUITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '5' },
  { code: '570', name: 'Geçmiş Yıl Karları', type: 'EQUITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '57' },
  { code: '580', name: 'Geçmiş Yıl Zararları (-)', type: 'EQUITY', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '57' },

  { code: '59', name: 'Dönem Net Karı/Zararı', type: 'EQUITY', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '5' },
  { code: '590', name: 'Dönem Net Karı', type: 'EQUITY', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '59' },
  { code: '591', name: 'Dönem Net Zararı (-)', type: 'EQUITY', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '59' },

  // ─── 6. SINIF: GELİR TABLOSU ───────────────────────────────────────────────
  { code: '6', name: 'Gelir Tablosu Hesapları', type: 'REVENUE', normalBalance: 'CREDIT', level: 1, isPostable: false },
  { code: '60', name: 'Brüt Satışlar', type: 'REVENUE', normalBalance: 'CREDIT', level: 2, isPostable: false, parentCode: '6' },
  { code: '600', name: 'Yurt İçi Satışlar', type: 'REVENUE', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '60' },
  { code: '601', name: 'Yurt Dışı Satışlar', type: 'REVENUE', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '60' },
  { code: '602', name: 'Diğer Gelirler', type: 'REVENUE', normalBalance: 'CREDIT', level: 3, isPostable: true, parentCode: '60' },

  { code: '61', name: 'Satış İndirimleri (-)', type: 'REVENUE', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '6' },
  { code: '610', name: 'Satıştan İadeler (-)', type: 'REVENUE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '61' },
  { code: '611', name: 'Satış İskontoları (-)', type: 'REVENUE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '61' },

  { code: '62', name: 'Satışların Maliyeti (-)', type: 'EXPENSE', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '6' },
  { code: '620', name: 'Satılan Mamullerin Maliyeti', type: 'EXPENSE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '62' },
  { code: '621', name: 'Satılan Ticari Malların Maliyeti', type: 'EXPENSE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '62' },
  { code: '622', name: 'Satılan Hizmet Maliyeti', type: 'EXPENSE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '62' },

  { code: '76', name: 'Pazarlama, Satış ve Dağıtım Giderleri', type: 'EXPENSE', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '6' },
  { code: '760', name: 'Pazarlama, Satış ve Dağıtım Giderleri', type: 'EXPENSE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '76' },

  { code: '77', name: 'Genel Yönetim Giderleri', type: 'EXPENSE', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '6' },
  { code: '770', name: 'Genel Yönetim Giderleri', type: 'EXPENSE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '77' },

  { code: '78', name: 'Finansman Giderleri', type: 'EXPENSE', normalBalance: 'DEBIT', level: 2, isPostable: false, parentCode: '6' },
  { code: '780', name: 'Finansman Giderleri', type: 'EXPENSE', normalBalance: 'DEBIT', level: 3, isPostable: true, parentCode: '78' },
];
