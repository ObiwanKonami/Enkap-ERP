import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Logger } from '@nestjs/common';
import { addMonths, subMonths, startOfMonth, endOfMonth, setDate, format, subDays, addDays } from 'date-fns';

// Relative imports from the project structure
// Since we run this with ts-node from the root, we can reach the source files
import { BASELINE_MIGRATIONS, ensureSchemaVersion } from '../apps/tenant-service/src/provisioning/migration-runner';
import { TenantSeeder } from '../apps/tenant-service/src/provisioning/tenant-seeder';
import { SchemaCreator } from '../apps/tenant-service/src/provisioning/schema-creator';

// ─── CONFIGURATION ─────────────────────────────────────────────────────────

const CONTROL_PLANE_URL = process.env.DATABASE_URL || 'postgresql://enkap_admin:localdev_only@postgres:5432/enkap_control_plane?sslmode=disable';

const GOLDEN_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const GOLDEN_SLUG = 'altin-demo';
const ADMIN_EMAIL = 'admin@enkap.com.tr';
const ADMIN_PASSWORD = 'Enkap2026!'; // Bcrypt will hash this
const COMPANY_NAME = 'Enkap Altın Teknoloji A.Ş.';

const SCHEMA_NAME = `t_${GOLDEN_TENANT_ID.replace(/-/g, '_')}`;
const ROLE_NAME = `enkap_${GOLDEN_TENANT_ID.replace(/-/g, '').slice(0, 12)}`;
const DB_PASSWORD = 'golden_demo_secure_pass_2026';

const logger = new Logger('GoldenSeed');

// ─── MAIN EXECUTION ────────────────────────────────────────────────────────

async function run() {
  logger.log('--- Golden User (Altın Demo) Seeding Başlıyor ---');

  const controlPlaneDs = new DataSource({
    type: 'postgres',
    url: CONTROL_PLANE_URL,
    synchronize: false,
    logging: false,
  });

  try {
    await controlPlaneDs.initialize();
    logger.log('Control Plane veritabanına bağlanıldı.');

    // [0] Control Plane migrasyonlarını kontrol et/çalıştır
    await migrateControlPlane(controlPlaneDs);

    // [1] Önce varsa eskiyi temizle (Idempotency)
    await cleanupTenant(controlPlaneDs);

    // [2] Tenant kaydı oluştur
    await createTenantRouting(controlPlaneDs);
    logger.log(`Tenant routing kaydı oluşturuldu: ${GOLDEN_SLUG}`);

    // [3] Şema ve Rol oluştur
    await createSchemaAndRole(controlPlaneDs);
    logger.log(`PostgreSQL şeması (${SCHEMA_NAME}) ve rolü (${ROLE_NAME}) oluşturuldu.`);

    // [3.5] Control Plane ek verileri (Profil, Abonelik)
    await initControlPlaneData(controlPlaneDs);
    logger.log('Control Plane yan verileri (Profil, Abonelik) oluşturuldu.');

    // [4] Migrasyonları çalıştır
    // Basitlik için migration-runner.ts'deki SQL'leri sırayla çalıştıran bir basitleştirilmiş mantık kullanacağız
    // veya doğrudan migration-runner-cli'yi çağırabiliriz.
    // Şimdilik script içinde BASELINE_MIGRATIONS SQL'lerini manual koşturacağız.
    await runMigrationsInSchema(controlPlaneDs);
    logger.log('Baseline migrasyonlar (V001-V037) başarıyla uygulandı.');

    // [5] Transactional Veri Tohumlama
    await seedDomainData(controlPlaneDs);

    logger.log('--- Golden User (Altın Demo) Seeding Tamamlandı! ---');
  } catch (err) {
    logger.error('Kritik hata: ' + (err as Error).message, (err as Error).stack);
    process.exit(1);
  } finally {
    await controlPlaneDs.destroy();
  }
}

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────

async function migrateControlPlane(ds: DataSource) {
  logger.log('Control Plane migrasyonları kontrol ediliyor...');
  const { CONTROL_PLANE_MIGRATIONS } = await import('../apps/tenant-service/src/provisioning/migration-runner');
  
  await ds.transaction(async (manager) => {
    await ensureSchemaVersion(manager);
    for (const migration of CONTROL_PLANE_MIGRATIONS) {
      const rows = await manager.query<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM schema_version WHERE version = $1`,
        [migration.version],
      );
      if (parseInt(rows[0]?.count ?? '0', 10) > 0) continue;
      
      logger.log(`CP Uygulanıyor: ${migration.version}`);
      await manager.query(migration.sql);
      await manager.query(
        `INSERT INTO schema_version (version, description, checksum) VALUES ($1, $2, $3)`,
        [migration.version, migration.description, migration.checksum],
      );
    }
  });
}

async function cleanupTenant(ds: DataSource) {
  logger.log('Eski golden tenant verileri (Control Plane) temizleniyor...');
  const tId = GOLDEN_TENANT_ID;

  const tablesToDelete = [
    'provisioning_log', 'webhook_deliveries', 'webhook_subscriptions', 'webhook_outbox',
    'billing_invoices', 'payment_attempts', 'subscriptions', 'tenant_profiles',
    'api_clients', 'white_label_configs', 'usage_events', 'widgets',
    'report_definitions', 'dashboards', 'tenant_routing'
  ];

  for (const table of tablesToDelete) {
    const exists = await ds.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      )
    `, [table]);

    if (exists[0].exists) {
        if (table === 'payment_attempts') {
            await ds.query(`DELETE FROM payment_attempts WHERE subscription_id IN (SELECT id FROM subscriptions WHERE tenant_id = $1)`, [tId]);
        } else {
            await ds.query(`DELETE FROM "${table}" WHERE tenant_id = $1`, [tId]);
        }
    }
  }

  await ds.query(`DROP SCHEMA IF EXISTS "${SCHEMA_NAME}" CASCADE`);
  await ds.query(`DROP ROLE IF EXISTS "${ROLE_NAME}"`);
}

async function initControlPlaneData(ds: DataSource) {
  const tId = GOLDEN_TENANT_ID;
  
  // 1. Profil
  await ds.query(`
    INSERT INTO tenant_profiles (tenant_id, company_name, trade_name, vkn, tax_office, address, city, district, email, website, onboarding_done)
    VALUES ($1, $2, $2, '1234567890', 'Büyük Mükellefler', 'Esen Sanayi Sitesi No:1', 'İstanbul', 'Esenyurt', $3, 'https://altin-demo.enkap.com', true)
    ON CONFLICT (tenant_id) DO UPDATE SET company_name = $2, updated_at = NOW()
  `, [tId, COMPANY_NAME, ADMIN_EMAIL]);

  // 2. Abonelik (Enterprise Plan)
  // Check available columns in subscriptions
  const subColumns = await ds.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions'
  `);
  const hasBillingCycle = subColumns.some((c: any) => c.column_name === 'billing_cycle');
  const hasPeriodStart = subColumns.some((c: any) => c.column_name === 'current_period_start');

  // Check billing_plans
  const planColumns = await ds.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'billing_plans'
  `);
  const hasTier = planColumns.some((c: any) => c.column_name === 'tier');

  let plans = [];
  if (hasTier) {
    plans = await ds.query(`SELECT id FROM billing_plans WHERE tier = 'enterprise' LIMIT 1`);
  } else {
    plans = await ds.query(`SELECT id FROM billing_plans LIMIT 1`);
  }

  let planId;
  if (plans.length === 0) {
    planId = randomUUID();
    await ds.query(`
      INSERT INTO billing_plans (id, name, slug, ${hasTier ? 'tier, ' : ''} monthly_price_kurus, is_active)
      VALUES ($1, 'Enterprise Plan', 'enterprise', ${hasTier ? "'enterprise', " : ''} 500000, true)
    `, [planId]);
  } else {
    planId = plans[0].id;
  }

  await ds.query(`
    INSERT INTO subscriptions (id, tenant_id, plan_id, status, ${hasBillingCycle ? 'billing_cycle, ' : ''} ${hasPeriodStart ? 'current_period_start, current_period_end' : ''})
    VALUES (
        $1, $2, $3, 'active' 
        ${hasBillingCycle ? ", 'annual'" : ''} 
        ${hasPeriodStart ? ', $4, $5' : ''}
    )
    ON CONFLICT (tenant_id) DO UPDATE SET plan_id = $3, status = 'active', updated_at = NOW()
  `, [
    randomUUID(), 
    tId, 
    planId, 
    ...(hasPeriodStart ? [subMonths(new Date(), 1), addMonths(new Date(), 11)] : [])
  ]);
}

async function createTenantRouting(ds: DataSource) {
  await ds.query(`
    INSERT INTO tenant_routing (
      tenant_id, tenant_slug, cluster_id, pgbouncer_endpoint,
      schema_name, pool_mode, tier, status
    )
    VALUES ($1, $2, 'alpha', $3, $4, 'session', 'enterprise', 'active')
  `, [
    GOLDEN_TENANT_ID,
    GOLDEN_SLUG,
    CONTROL_PLANE_URL, // Localde doğrudan aynı DB
    SCHEMA_NAME
  ]);
}

async function createSchemaAndRole(ds: DataSource) {
  await ds.query(`CREATE SCHEMA "${SCHEMA_NAME}"`);
  
  // Create role idempotent (DO block)
  await ds.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${ROLE_NAME}') THEN
        CREATE ROLE "${ROLE_NAME}" WITH LOGIN PASSWORD '${DB_PASSWORD}';
      END IF;
    END
    $$;
  `);

  await ds.query(`GRANT ALL PRIVILEGES ON SCHEMA "${SCHEMA_NAME}" TO "${ROLE_NAME}"`);
  await ds.query(`ALTER ROLE "${ROLE_NAME}" SET search_path TO "${SCHEMA_NAME}", pg_catalog`);
}

async function runMigrationsInSchema(ds: DataSource) {
  logger.log(`Baseline migrasyonlar uygulanıyor: schema=${SCHEMA_NAME}`);
  
  await ds.transaction(async (manager) => {
    // search_path'i geçici olarak değiştiriyoruz (transactional)
    await manager.query(`SET search_path TO "${SCHEMA_NAME}", public`);
    
    await ensureSchemaVersion(manager);

    for (const migration of BASELINE_MIGRATIONS) {
      const rows = await manager.query<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM schema_version WHERE version = $1`,
        [migration.version],
      );
      const applied = parseInt(rows[0]?.count ?? '0', 10) > 0;

      if (applied) continue;

      logger.debug(`Uygulanıyor: ${migration.version} — ${migration.description}`);
      await manager.query(migration.sql);
      await manager.query(
        `INSERT INTO schema_version (version, description, checksum) VALUES ($1, $2, $3)`,
        [migration.version, migration.description, migration.checksum],
      );
    }
  });

  // RLS Politikalarını uygula
  logger.log('RLS politikaları uygulanıyor...');
  const businessTables = [
    'invoices', 'invoice_lines', 'products', 'stock_movements', 'warehouses',
    'journal_entries', 'journal_entry_lines', 'accounts',
    'purchase_orders', 'purchase_order_lines', 'sales_orders', 'sales_order_lines',
    'crm_contacts', 'crm_leads',
    'employees', 'payrolls', 'treasury_accounts', 'treasury_transactions',
    'fixed_assets', 'leave_requests', 'expense_reports',
    'vehicles', 'drivers', 'trips', 'maintenance_records', 'fuel_records',
    'boms', 'work_orders',
    'projects', 'project_tasks', 'project_costs',
    'budgets', 'notifications'
  ];

  for (const table of businessTables) {
    try {
      await ds.query(`ALTER TABLE "${SCHEMA_NAME}"."${table}" ENABLE ROW LEVEL SECURITY`);
      await ds.query(`ALTER TABLE "${SCHEMA_NAME}"."${table}" FORCE ROW LEVEL SECURITY`);
      const policyName = `rls_tenant_isolation_${table}`;
      await ds.query(`DROP POLICY IF EXISTS "${policyName}" ON "${SCHEMA_NAME}"."${table}"`);
      await ds.query(`
        CREATE POLICY "${policyName}" ON "${SCHEMA_NAME}"."${table}"
          USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
          WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid)
      `);
    } catch (e) {
      // Bazı tablolar migration versiyonuna göre henüz oluşmamış olabilir veya isim farklılığı olabilir
      logger.warn(`RLS uygulanamadı (${table}): ${(e as Error).message}`);
    }
  }
}

async function seedDomainData(ds: DataSource) {
  logger.log('Temel veriler tohumlanıyor (KDV, Cities, TDHP)...');
  
  // Basit bir mock DataSourceManager oluşturuyoruz
  const mockDsManager = {
    getDataSource: async () => ds
  } as any;

  const seeder = new TenantSeeder(mockDsManager);
  
  // TenantSeeder.seed manager beklediği için doğrudan transaction içinde çalıştıralım
  await ds.transaction(async (manager) => {
    await manager.query(`SET search_path TO "${SCHEMA_NAME}", public`);
    // app.current_tenant set etmeliyiz çünkü TenantSeeder içinde sorgular buna göre filtreleyebilir (RLS varsa)
    await manager.query(`SET LOCAL app.current_tenant = '${GOLDEN_TENANT_ID}'`);
    
    // TenantSeeder class'ı içindeki private metodları çağıramayız ama seed metodunu genelleyebiliriz
    // Not: TenantSeeder.seed manager tipinde değil DataSourceManager bekliyor.
    // O yüzden içindeki adımları buraya alalım veya public bir metod uyduralım.
    // En temizi seeder metodlarını buraya taşımak veya seeder'ı manager ile çalışacak şekilde çağırmak.
    await (seeder as any).seedKdvRates(manager, GOLDEN_TENANT_ID);
    await (seeder as any).seedCities(manager, GOLDEN_TENANT_ID);
    await (seeder as any).seedTdhpAccounts(manager, GOLDEN_TENANT_ID);
    await (seeder as any).seedDefaultRoles(manager, GOLDEN_TENANT_ID);
    await (seeder as any).seedDefaultWarehouse(manager, GOLDEN_TENANT_ID);
  });

  logger.log('Admin kullanıcı oluşturuluyor...');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const adminId = randomUUID();
  await ds.query(`
    INSERT INTO "${SCHEMA_NAME}".users (id, tenant_id, email, name, password_hash, is_active)
    VALUES ($1, $2, $3, $4, $5, true)
    ON CONFLICT DO NOTHING
  `, [adminId, GOLDEN_TENANT_ID, ADMIN_EMAIL.toLowerCase(), 'Altın Admin', passwordHash]);

  await ds.query(`
    INSERT INTO "${SCHEMA_NAME}".user_roles (user_id, role_id)
    SELECT $1, id FROM "${SCHEMA_NAME}".roles WHERE tenant_id = $2 AND name = 'sistem_admin'
    ON CONFLICT DO NOTHING
  `, [adminId, GOLDEN_TENANT_ID]);

  // 6 aylık veri generasyonu buraya gelecek
  await generateTransactionalHistory(ds);
}

async function generateTransactionalHistory(ds: DataSource) {
  logger.log('--- 6 Aylık İşlemsel Geçmiş Üretiliyor ---');
  
  const today = new Date();
  const startAt = subMonths(startOfMonth(today), 6);
  
  await ds.transaction(async (manager) => {
    await manager.query(`SET search_path TO "${SCHEMA_NAME}", public`);
    await manager.query(`SET LOCAL app.current_tenant = '${GOLDEN_TENANT_ID}'`);

    // 1. Müşteriler ve Tedarikçiler
    const customers = await seedCustomers(manager);
    const vendors = await seedVendors(manager);
    const products = await seedProducts(manager);
    const employees = await seedEmployees(manager);
    const bankAccounts = await seedBankAccounts(manager);
    await seedFleetMasterData(manager, employees);

    // 2. Aylık döngü
    for (let i = 0; i <= 6; i++) {
        const currentMonth = addMonths(startAt, i);
        if (currentMonth > today) break;
        
        const monthStr = format(currentMonth, 'yyyy-MM');
        logger.log(`İşleniyor: ${monthStr}`);

        // Satın Almalar (Ay başı)
        await seedPurchases(manager, vendors, products, currentMonth);
        
        // Satışlar (Tüm ay boyu)
        await seedSales(manager, customers, products, currentMonth);
        
        // --- YENİ MODÜLLER ---
        await seedFleet(manager, employees, currentMonth);
        await seedManufacturing(manager, products, currentMonth);
        await seedCRMLeads(manager, currentMonth);
        await seedProjects(manager, customers, currentMonth);
        await seedFixedAssets(manager, currentMonth);
        await seedBudgets(manager, currentMonth);
        await seedNotifications(manager, currentMonth);
        
        // Giderler ve Maaşlar
        await seedPayroll(manager, employees, currentMonth);
        await seedExpenses(manager, employees, currentMonth);
        
        // Banka Hareketleri
        await seedBankTransactions(manager, bankAccounts, currentMonth);
    }
  });
}

// Mock veriler ve generatorlar...
async function seedCustomers(manager: EntityManager) {
  logger.log('Müşteriler (crm_contacts) oluşturuluyor...');
  const customers = [
    { code: 'M-001', name: 'Global Lojistik Dış Tic. Ltd. Şti.', tax_id: '4010203040', city: 'İstanbul' },
    { code: 'M-002', name: 'Anadolu Gıda ve İhtiyaç Maddeleri A.Ş.', tax_id: '0701802930', city: 'Ankara' },
    { code: 'M-003', name: 'Ege Teknoloji Çözümleri A.Ş.', tax_id: '3550403020', city: 'İzmir' },
    { code: 'M-004', name: 'Zirve İnşaat Malzemeleri Ltd.', tax_id: '1610903020', city: 'Bursa' },
    { code: 'M-005', name: 'Bahar Tekstil Sanayi', tax_id: '2020304050', city: 'Denizli' },
    { code: 'M-006', name: 'Ahmet Yılmaz (Bireysel)', tckn: '12345678901', city: 'İstanbul' },
  ];

  const result = [];
  for (const c of customers) {
    const id = randomUUID();
    await manager.query(`
      INSERT INTO crm_contacts (id, tenant_id, first_name, last_name, contact_type, vkn, tckn, city)
      VALUES ($1, $2, $3, '', 'CUSTOMER', $4, $5, $6)
    `, [id, GOLDEN_TENANT_ID, c.name, c.tax_id || null, c.tckn || null, c.city]);
    result.push({ id, ...c });
  }
  return result;
}

async function seedVendors(manager: EntityManager) {
  logger.log('Tedarikçiler (crm_contacts) oluşturuluyor...');
  const vendors = [
    { code: 'T-001', name: 'Akaryakıt Dağıtım A.Ş.', tax_id: '9998887776' },
    { code: 'T-002', name: 'Ofis Malzemeleri Dünyası', tax_id: '1112223334' },
    { code: 'T-003', name: 'Yazılım Destek Hizmetleri Ltd.', tax_id: '5554443332' },
    { code: 'T-004', name: 'Güvenlik ve Temizlik Çözümleri', tax_id: '7776665554' },
  ];

  const result = [];
  for (const v of vendors) {
    const id = randomUUID();
    await manager.query(`
      INSERT INTO crm_contacts (id, tenant_id, first_name, last_name, contact_type, vkn)
      VALUES ($1, $2, $3, '', 'VENDOR', $4)
    `, [id, GOLDEN_TENANT_ID, v.name, v.tax_id]);
    result.push({ id, ...v });
  }
  return result;
}

async function seedProducts(manager: EntityManager) {
  logger.log('Ürünler oluşturuluyor...');
  const products = [
    { sku: 'PRD-001', name: 'Kurumsal Yazılım Lisansı - Standart', kdv: 20, price: 500000 },
    { sku: 'PRD-002', name: 'Donanım Paketi (İş İstasyonu)', kdv: 20, price: 1200000 },
    { sku: 'PRD-003', name: 'Bulut Depolama Hizmeti (Yıllık)', kdv: 20, price: 150000 },
    { sku: 'PRD-004', name: 'Teknik Destek Paketi (Aylık)', kdv: 20, price: 85000 },
    { sku: 'PRD-005', name: 'Dijital Güvenlik Sertifikası', kdv: 20, price: 45000 },
    { sku: 'PRD-006', name: 'Sarf Malzeme Seti', kdv: 20, price: 12500 },
  ];

  const result = [];
  for (const p of products) {
    const id = randomUUID();
    await manager.query(`
      INSERT INTO products (id, tenant_id, sku, name, kdv_rate, list_price_kurus, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
    `, [id, GOLDEN_TENANT_ID, p.sku, p.name, p.kdv, p.price]);
    result.push({ id, ...p });
  }
  return result;
}

async function seedEmployees(manager: EntityManager) {
  logger.log('Çalışanlar oluşturuluyor...');
  const employees = [
    { no: 'PER-001', name: 'Selim', surname: 'Akın', title: 'Genel Müdür', salary: 15000000, hireDate: subMonths(new Date(), 12) },
    { no: 'PER-002', name: 'Ayşe', surname: 'Demir', title: 'Finans Müdürü', salary: 8500000, hireDate: subMonths(new Date(), 10) },
    { no: 'PER-003', name: 'Murat', surname: 'Can', title: 'Yazılım Geliştirici', salary: 6500000, hireDate: subMonths(new Date(), 8) },
    { no: 'PER-004', name: 'Zeynep', surname: 'Kaya', title: 'Satış Temsilcisi', salary: 4500000, hireDate: subMonths(new Date(), 6) },
    { no: 'PER-005', name: 'Bülent', surname: 'Aras', title: 'Saha Elemanı', salary: 3500000, hireDate: subMonths(new Date(), 5) },
  ];

  const result = [];
  for (const e of employees) {
    const id = randomUUID();
    await manager.query(`
      INSERT INTO employees (id, tenant_id, sicil_no, name, surname, title, gross_salary_kurus, hire_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
    `, [id, GOLDEN_TENANT_ID, e.no, e.name, e.surname, e.title, e.salary, e.hireDate]);
    result.push({ id, ...e });
  }
  return result;
}

async function seedBankAccounts(manager: EntityManager) {
  logger.log('Banka hesapları oluşturuluyor...');
  const accounts = [
    { name: 'Garanti Bankası - TRY', type: 'BANKA', currency: 'TRY', balance: 250000000 }, // 2.5M TL
    { name: 'İş Bankası - USD', type: 'BANKA', currency: 'USD', balance: 5000000 },    // 50k USD
    { name: 'Merkez Kasa', type: 'KASA', currency: 'TRY', balance: 5000000 },         // 50k TL
  ];

  const result = [];
  for (const a of accounts) {
    const id = randomUUID();
    await manager.query(`
      INSERT INTO treasury_accounts (id, tenant_id, name, account_type, currency, balance_kurus, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
    `, [id, GOLDEN_TENANT_ID, a.name, a.type, a.currency, a.balance]);
    result.push({ id, ...a });
  }
  return result;
}
async function seedPurchases(manager: EntityManager, vendors: any[], products: any[], date: Date) {
  // Ayın ilk haftasında 2-3 büyük alım yapalım
  const purchaseCount = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < purchaseCount; i++) {
    const vendor = vendors[Math.floor(Math.random() * vendors.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const qty = 10 + Math.floor(Math.random() * 50);
    const unitPrice = Math.floor(product.price * 0.8); // Tedarikçiden %20 ucuza alıyoruz
    const totalKurus = BigInt(qty) * BigInt(unitPrice);
    
    // 1. Stok Hareketi (GIRIŞ)
    await manager.query(`
      INSERT INTO stock_movements (id, tenant_id, product_id, warehouse_id, type, quantity, unit_cost_kurus, total_cost_kurus, created_at, created_by)
      VALUES ($1, $2, $3, (SELECT id FROM warehouses WHERE tenant_id = $2 LIMIT 1), 'GIRIS', $4, $5, $6, $7, 'system')
    `, [randomUUID(), GOLDEN_TENANT_ID, product.id, qty, unitPrice, totalKurus.toString(), addDays(date, i * 2)]);

    // 2. Fatura (Alış)
    const invoiceId = randomUUID();
    await manager.query(`
      INSERT INTO invoices (id, tenant_id, invoice_number, counterparty_id, invoice_type, direction, issue_date, subtotal, total, status, created_by)
      VALUES ($1, $2, $3, $4, 'PURCHASE', 'IN', $5, $6, $7, 'SENT_GIB', $1)
    `, [invoiceId, GOLDEN_TENANT_ID, `AL-${format(date, 'yyyy')}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, vendor.id, addDays(date, i * 2), totalKurus.toString(), totalKurus.toString()]);
  }
}

async function seedSales(manager: EntityManager, customers: any[], products: any[], date: Date) {
  const salesCount = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < salesCount; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const qty = 1 + Math.floor(Math.random() * 5);
    const unitPrice = product.price; 
    const totalKurus = BigInt(qty) * BigInt(unitPrice);
    const saleDate = addDays(date, Math.floor(Math.random() * 25));

    // 1. Stok Hareketi (ÇIKIŞ)
    await manager.query(`
      INSERT INTO stock_movements (id, tenant_id, product_id, warehouse_id, type, quantity, unit_cost_kurus, total_cost_kurus, created_at, created_by)
      VALUES ($1, $2, $3, (SELECT id FROM warehouses WHERE tenant_id = $2 LIMIT 1), 'CIKIS', $4, $5, $6, $7, 'system')
    `, [randomUUID(), GOLDEN_TENANT_ID, product.id, qty, unitPrice, totalKurus.toString(), saleDate]);

    // 2. Fatura (Satış)
    const invoiceId = randomUUID();
    await manager.query(`
      INSERT INTO invoices (id, tenant_id, invoice_number, counterparty_id, invoice_type, direction, issue_date, subtotal, total, status, created_by)
      VALUES ($1, $2, $3, $4, 'E_FATURA', 'OUT', $5, $6, $7, 'ACCEPTED_GIB', $1)
    `, [invoiceId, GOLDEN_TENANT_ID, `SAT-${format(date, 'yyyy')}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, customer.id, saleDate, totalKurus.toString(), totalKurus.toString()]);

    // 3. Tahsilat
    await manager.query(`
      INSERT INTO treasury_transactions (id, tenant_id, account_id, transaction_type, amount_kurus, direction, transaction_date, description)
      VALUES ($1, $2, (SELECT id FROM treasury_accounts WHERE tenant_id = $2 AND currency = 'TRY' LIMIT 1), 'TAHSILAT', $3, 'IN', $4, $5)
    `, [randomUUID(), GOLDEN_TENANT_ID, totalKurus.toString(), saleDate, `${customer.name} Tahsilat`]);
  }
}

async function seedPayroll(manager: EntityManager, employees: any[], date: Date) {
    const payrollDate = endOfMonth(date);
    const year = parseInt(format(date, 'yyyy'), 10);
    const month = parseInt(format(date, 'MM'), 10);

    for (const emp of employees) {
        const payrollId = randomUUID();
        const netSalary = BigInt(emp.salary) * BigInt(70) / BigInt(100); 
        
        await manager.query(`
            INSERT INTO payrolls (id, tenant_id, employee_id, period_year, period_month, gross_kurus, net_kurus, status, paid_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'PAID', $8)
        `, [payrollId, GOLDEN_TENANT_ID, emp.id, year, month, emp.salary, netSalary.toString(), payrollDate]);

        // Bankadan maaş ödemesi
        await manager.query(`
            INSERT INTO treasury_transactions (id, tenant_id, account_id, transaction_type, amount_kurus, direction, transaction_date, description, created_by)
            VALUES ($1, $2, (SELECT id FROM treasury_accounts WHERE tenant_id = $2 AND currency = 'TRY' LIMIT 1), 'ODEME', $3, 'OUT', $4, $5, 'system')
        `, [randomUUID(), GOLDEN_TENANT_ID, netSalary.toString(), payrollDate, `${emp.name} ${emp.surname} Maaş Ödemesi`]);
    }
}

async function seedExpenses(manager: EntityManager, employees: any[], date: Date) {
  // Her ay 3-5 rastgele masraf
  const categories = ['YEMEK', 'ULASIM', 'OFIS', 'DIGER'];
  const expenseCount = 3 + Math.floor(Math.random() * 3);
  
  for (let i = 0; i < expenseCount; i++) {
    const emp = employees[Math.floor(Math.random() * employees.length)];
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const amount = 50000 + Math.floor(Math.random() * 200000); // 500 - 2000 TL
    const expenseDate = addDays(date, Math.floor(Math.random() * 28));

    const reportId = randomUUID();
    await manager.query(`
      INSERT INTO expense_reports (id, tenant_id, employee_id, employee_name, period, status, total_kurus, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, 'ODENDI', $6, $3, $7)
    `, [reportId, GOLDEN_TENANT_ID, emp.id, `${emp.name} ${emp.surname}`, format(date, 'yyyy-MM'), amount, expenseDate]);

    await manager.query(`
      INSERT INTO expense_lines (id, report_id, category, description, expense_date, amount_kurus)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [randomUUID(), reportId, cat, `${cat} Gideri`, expenseDate, amount]);
  }
}

async function seedBankTransactions(manager: EntityManager, accounts: any[], date: Date) {
  // Kira ve Fatura ödemeleri
  const rentAmount = 7500000; // 75k TL
  const rentDate = addDays(date, 5);
  
  await manager.query(`
    INSERT INTO treasury_transactions (id, tenant_id, account_id, transaction_type, amount_kurus, direction, transaction_date, description, created_by)
    VALUES ($1, $2, (SELECT id FROM treasury_accounts WHERE tenant_id = $2 AND currency = 'TRY' LIMIT 1), 'ODEME', $3, 'OUT', $4, 'Ofis Kirası Ödemesi', 'system')
  `, [randomUUID(), GOLDEN_TENANT_ID, rentAmount, rentDate]);

  // Elektrik/Su/İnternet
  const utilityAmount = 150000 + Math.floor(Math.random() * 100000);
  const utilityDate = addDays(date, 15);
  await manager.query(`
    INSERT INTO treasury_transactions (id, tenant_id, account_id, transaction_type, amount_kurus, direction, transaction_date, description, created_by)
    VALUES ($1, $2, (SELECT id FROM treasury_accounts WHERE tenant_id = $2 AND currency = 'TRY' LIMIT 1), 'ODEME', $3, 'OUT', $4, 'Elektrik/Su Faturası', 'system')
  `, [randomUUID(), GOLDEN_TENANT_ID, utilityAmount, utilityDate]);
}

// ─── NEW MODULE SEEDERS ──────────────────────────────────────────────────

async function seedFleetMasterData(manager: EntityManager, employees: any[]) {
    logger.log('Filo ana verileri oluşturuluyor...');
    const vehiclesData = [
        { plate: '34 ENK 001', brand: 'Mercedes', model: 'Actros', type: 'TRUCK' },
        { plate: '34 ENK 002', brand: 'Iveco', model: 'Daily', type: 'VAN' },
        { plate: '34 ENK 003', brand: 'Fiat', model: 'Doblo', type: 'CAR' }
    ];

    for (let i = 0; i < vehiclesData.length; i++) {
        const v = vehiclesData[i];
        const vehicleId = randomUUID();
        await manager.query(`
            INSERT INTO vehicles (id, tenant_id, vehicle_number, plate, make, model, type, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
            ON CONFLICT (tenant_id, plate) DO NOTHING
        `, [vehicleId, GOLDEN_TENANT_ID, `VEC-${100 + i}`, v.plate, v.brand, v.model, v.type]);

        const driverEmp = employees[i % employees.length];
        const driverId = randomUUID();
        await manager.query(`
            INSERT INTO drivers (id, tenant_id, employee_id, full_name, license_number, license_class, status)
            VALUES ($1, $2, $3, $4, $5, 'C', 'active')
            ON CONFLICT DO NOTHING
        `, [driverId, GOLDEN_TENANT_ID, driverEmp.id, `${driverEmp.name} ${driverEmp.surname}`, `LIC-${1000 + i}`]);
    }
}

async function seedFleet(manager: EntityManager, employees: any[], date: Date) {
    const vehicles = await manager.query(`SELECT id FROM vehicles WHERE tenant_id = $1`, [GOLDEN_TENANT_ID]);
    const drivers = await manager.query(`SELECT id FROM drivers WHERE tenant_id = $1`, [GOLDEN_TENANT_ID]);
    
    if (vehicles.length === 0 || drivers.length === 0) return;

    for (let i = 0; i < vehicles.length; i++) {
        const vehicleId = vehicles[i].id;
        const driverId = drivers[i % drivers.length].id;

        // 1. Sefer Kaydı
        const tripId = randomUUID();
        await manager.query(`
            INSERT INTO trips (id, tenant_id, trip_number, vehicle_id, driver_id, origin, destination, planned_departure, status, created_by)
            VALUES ($1, $2, $3, $4, $5, 'İstanbul', 'Ankara', $6, 'completed', 'system')
        `, [tripId, GOLDEN_TENANT_ID, `SF-${format(date, 'yyyy')}-${randomUUID().slice(0, 5).toUpperCase()}`, vehicleId, driverId, addDays(date, 10)]);

        // 2. Yakıt alımı
        await manager.query(`
            INSERT INTO fuel_records (id, tenant_id, vehicle_id, driver_id, fuel_date, liters, unit_price_kurus, total_kurus, created_by)
            VALUES ($1, $2, $3, $4, $5, 50, 4500, 225000, 'system')
        `, [randomUUID(), GOLDEN_TENANT_ID, vehicleId, driverId, addDays(date, 12)]);
    }
}

async function seedManufacturing(manager: EntityManager, products: any[], date: Date) {
    const monthIdx = parseInt(format(date, 'MM'), 10);
    // Hammadde ve Mamul seçelim
    const mamos = products.slice(0, 2); // İlk iki ürün mamul olsun
    const raw = products.slice(2, 5);   // Diğerleri hammadde

    for (const prod of mamos) {
        // 1. Reçete (BOM)
        const bomId = randomUUID();
        await manager.query(`
            INSERT INTO boms (id, tenant_id, product_id, product_name, revision_no, is_active)
            VALUES ($1, $2, $3, $4, '1.0', true)
            ON CONFLICT DO NOTHING
        `, [bomId, GOLDEN_TENANT_ID, prod.id, prod.name]);

        // BOM Satırları
        for (const r of raw) {
            await manager.query(`
                INSERT INTO bom_lines (id, bom_id, material_id, material_name, quantity)
                VALUES ($1, $2, $3, $4, 2)
                ON CONFLICT DO NOTHING
            `, [randomUUID(), bomId, r.id, r.name]);
        }

        // 2. İş Emri (Her ay 1 adet)
        const woId = randomUUID();
        await manager.query(`
            INSERT INTO work_orders (id, tenant_id, wo_number, bom_id, product_id, product_name, target_quantity, produced_quantity, status, planned_start_date, planned_end_date, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, 100, 100, 'completed', $7, $8, (SELECT id FROM users WHERE tenant_id = $2 LIMIT 1))
        `, [woId, GOLDEN_TENANT_ID, `WO-${format(date, 'yyyyMM')}-${prod.sku}`, bomId, prod.id, prod.name, date, addDays(date, 5)]);
    }
}

async function seedCRMLeads(manager: EntityManager, date: Date) {
    const contacts = await manager.query(`SELECT id FROM crm_contacts WHERE tenant_id = $1 LIMIT 2`, [GOLDEN_TENANT_ID]);
    if (contacts.length === 0) return;

    const leadData = [
        { title: 'X Holding Dijital Dönüşüm', stage: 'proposal', prob: 60 },
        { title: 'Y Lojistik Entegrasyon', stage: 'new', prob: 20 }
    ];

    for (let i = 0; i < leadData.length; i++) {
        const l = leadData[i];
        const leadId = randomUUID();
        const contactId = contacts[i % contacts.length].id;
        
        await manager.query(`
            INSERT INTO crm_leads (id, tenant_id, contact_id, title, value_kurus, stage, probability, created_at)
            VALUES ($1, $2, $3, $4, 50000000, $5, $6, $7)
        `, [leadId, GOLDEN_TENANT_ID, contactId, l.title, l.stage, l.prob, date]);

        // Aktivite
        await manager.query(`
            INSERT INTO crm_activities (id, tenant_id, lead_id, contact_id, type, subject, body, created_at)
            VALUES ($1, $2, $3, $4, 'call', 'Tanışma Toplantısı', 'İlk görüşme olumlu geçti.', $5)
        `, [randomUUID(), GOLDEN_TENANT_ID, leadId, contactId, date]);
    }
}

async function seedProjects(manager: EntityManager, customers: any[], date: Date) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const prjId = randomUUID();
    await manager.query(`
        INSERT INTO projects (id, tenant_id, code, name, status, start_date, budget_kurus, customer_id)
        VALUES ($1, $2, $3, $4, 'active', $5, 100000000, $6)
    `, [prjId, GOLDEN_TENANT_ID, `PRJ-${format(date, 'MM')}`, `${customer.name} - ERP Faz 1`, date, customer.id]);

    // Görev
    await manager.query(`
        INSERT INTO project_tasks (id, tenant_id, project_id, title, status, due_date)
        VALUES ($1, $2, $3, 'Analiz ve Tasarım', 'done', $4)
    `, [randomUUID(), GOLDEN_TENANT_ID, prjId, addDays(date, 7)]);
}

async function seedFixedAssets(manager: EntityManager, date: Date) {
    const monthIdx = parseInt(format(date, 'MM'), 10);
    if (monthIdx === 1) { // Sadece yıl başında bir kez
        const assetId = randomUUID();
        await manager.query(`
            INSERT INTO fixed_assets (id, tenant_id, name, asset_code, category, acquisition_date, acquisition_cost_kurus, useful_life_years)
            VALUES ($1, $2, 'Sunucu Kümesi - Proliant', 'DA-001', 'BILGISAYAR', $3, 120000000, 5)
        `, [assetId, GOLDEN_TENANT_ID, subMonths(date, 12)]);
    }
}

async function seedBudgets(manager: EntityManager, date: Date) {
    const monthIdx = parseInt(format(date, 'MM'), 10);
    if (monthIdx === 1) { // Yıl başında bütçe planı
        const budgetId = randomUUID();
        await manager.query(`
            INSERT INTO budgets (id, tenant_id, year, name, is_approved)
            VALUES ($1, $2, 2026, '2026 Yıllık Operasyon Bütçesi', true)
        `, [budgetId, GOLDEN_TENANT_ID]);
    }
}

async function seedNotifications(manager: EntityManager, date: Date) {
    await manager.query(`
        INSERT INTO notifications (id, tenant_id, category, level, title, body, is_read)
        VALUES ($1, $2, 'sistem', 'success', 'Aylık Kapama', 'Mali dönem başarıyla kapatıldı.', true)
    `, [randomUUID(), GOLDEN_TENANT_ID]);
}

run();
