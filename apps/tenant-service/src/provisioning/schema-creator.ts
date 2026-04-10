import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * PostgreSQL şema, rol ve güvenlik politikalarını oluşturur.
 *
 * Her adım idempotent'tir (IF NOT EXISTS) — yarıda kalan
 * bir provizyon yeniden çalıştırılabilir.
 *
 * Üretilen yapı:
 *  - Schema: tenant_{uuid}
 *  - Role:   enkap_tenant_{kısa_uuid}  (LOGIN, kısıtlı yetkiler)
 *  - search_path: role seviyesinde kilitli
 *  - RLS politikaları: tüm iş tabloları için
 */
@Injectable()
export class SchemaCreator {
  private readonly logger = new Logger(SchemaCreator.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly db: DataSource,
  ) {}

  /**
   * Tenant için tam izole PostgreSQL ortamı oluşturur.
   *
   * @returns Oluşturulan şema adı
   */
  async create(tenantId: string, dbPassword: string): Promise<string> {
    const schemaName = this.toSchemaName(tenantId);
    const roleName = this.toRoleName(tenantId);

    this.logger.log(`Şema oluşturuluyor: ${schemaName}`);

    // Tüm DDL işlemleri tek transaction'da
    await this.db.transaction(async (manager) => {
      // [1] Şema oluştur
      await manager.query(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
      );

      // [2] Uygulama rolünü oluştur (superuser değil)
      // pg_roles'de yoksa oluştur — idempotent
      await manager.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT FROM pg_catalog.pg_roles WHERE rolname = '${roleName}'
          ) THEN
            CREATE ROLE "${roleName}"
              WITH LOGIN
              PASSWORD '${dbPassword}'
              NOSUPERUSER
              NOCREATEDB
              NOCREATEROLE
              CONNECTION LIMIT 10;
          END IF;
        END
        $$;
      `);

      // [3] Şema üzerindeki temel izinler
      await manager.query(
        `GRANT USAGE ON SCHEMA "${schemaName}" TO "${roleName}"`,
      );
      await manager.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES
         IN SCHEMA "${schemaName}" TO "${roleName}"`,
      );
      await manager.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES
         IN SCHEMA "${schemaName}" TO "${roleName}"`,
      );

      // [4] Gelecekte oluşturulacak tablolar için varsayılan izinler
      await manager.query(`
        ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${roleName}"
      `);
      await manager.query(`
        ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
          GRANT USAGE, SELECT ON SEQUENCES TO "${roleName}"
      `);

      // [5] search_path'i rol seviyesinde kilitle
      // Uygulama katmanından SET search_path komutunu engeller
      await manager.query(
        `ALTER ROLE "${roleName}" SET search_path TO "${schemaName}", pg_catalog`,
      );

      // [6] Kritik güvenlik: pg_catalog erişimini kısıtla
      // Rol yalnızca kendi şemasını görebilir
      await manager.query(
        `REVOKE CREATE ON SCHEMA public FROM "${roleName}"`,
      );
    });

    this.logger.log(`Şema hazır: ${schemaName}, Rol: ${roleName}`);
    return schemaName;
  }

  /**
   * RLS (Row Level Security) politikalarını tablolara uygular.
   *
   * Migration tamamlandıktan SONRA çağrılmalıdır —
   * tablolar var olduktan sonra politika oluşturulabilir.
   */
  async applyRlsPolicies(tenantId: string): Promise<void> {
    const schemaName = this.toSchemaName(tenantId);

    this.logger.log(`RLS politikaları uygulanıyor: ${schemaName}`);

    // RLS politikası uygulanacak iş tabloları
    const businessTables = [
      'invoices',
      'invoice_lines',
      'products',
      'stock_movements',
      'warehouses',
      'customers',
      'vendors',
      'journal_entries',
      'journal_entry_lines',
      'accounts',
      'payments',
      'purchase_orders',
      'sales_orders',
    ];

    for (const table of businessTables) {
      await this.applyRlsToTable(schemaName, table);
    }

    this.logger.log(`RLS politikaları tamamlandı: ${businessTables.length} tablo`);
  }

  /**
   * Oluşturulan şema ve rolü tamamen siler.
   * Yalnızca başarısız provizyon geri alması için kullanılır.
   */
  async drop(tenantId: string): Promise<void> {
    const schemaName = this.toSchemaName(tenantId);
    const roleName = this.toRoleName(tenantId);

    this.logger.warn(`Şema siliniyor (rollback): ${schemaName}`);

    await this.db.query(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
    );
    await this.db.query(
      `DROP ROLE IF EXISTS "${roleName}"`,
    );
  }

  // ─── Özel yardımcı metodlar ─────────────────────────────────────────────────

  private async applyRlsToTable(
    schemaName: string,
    tableName: string,
  ): Promise<void> {
    // Tablonun var olup olmadığını kontrol et (migration henüz çalışmamış olabilir)
    const exists = await this.db.query<[{ exists: boolean }]>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      )
    `, [schemaName, tableName]);

    if (!exists[0]?.exists) return;

    const fullName = `"${schemaName}"."${tableName}"`;

    // RLS'i etkinleştir
    await this.db.query(`ALTER TABLE ${fullName} ENABLE ROW LEVEL SECURITY`);

    // FORCE: tablo sahibi bile politikadan muaf tutulmaz
    await this.db.query(`ALTER TABLE ${fullName} FORCE ROW LEVEL SECURITY`);

    // Politika adı idempotent — varsa önce sil
    const policyName = `rls_tenant_isolation_${tableName}`;
    await this.db.query(
      `DROP POLICY IF EXISTS "${policyName}" ON ${fullName}`,
    );

    // Hem okuma hem yazma politikası
    await this.db.query(`
      CREATE POLICY "${policyName}" ON ${fullName}
        USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  toSchemaName(tenantId: string): string {
    // UUID tire karakterlerini kaldır → geçerli PostgreSQL tanımlayıcı
    return `t_${tenantId.replace(/-/g, '_')}`;
  }

  private toRoleName(tenantId: string): string {
    // İlk 8 karakter yeterince benzersiz
    return `enkap_${tenantId.replace(/-/g, '').slice(0, 12)}`;
  }
}
