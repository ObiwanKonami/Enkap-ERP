import type { Migration } from '../migration-runner';

/**
 * SQUASHED BASELINE — V001–V063 arası tüm tenant şema migration'larının
 * tek bir idempotent CREATE TABLE blokuna birleştirilmiş hâli.
 *
 * Yeni tenantlar yalnızca bu migration'ı çalıştırır.
 * Mevcut tenantlarda schema_version tablosunda V001 kaydı zaten mevcut
 * olduğundan applyMigrationBatch() bu migration'ı atlar.
 *
 * FK bağımlılık sırası (tepeden aşağı):
 *   cities → districts
 *   roles → users → user_roles → device_tokens
 *   crm_contacts → crm_leads → crm_activities
 *   employees → payrolls, advances, attendance_records, overtime_entries,
 *               employee_assets, termination_details, leave_requests
 *   warehouses, product_categories → products → stock_movements
 *   gib_envelopes  (invoices ve waybills'ten önce)
 *   invoices → invoice_lines, payment_plans → payment_installments
 *           → application_responses, e_archive_reports
 *   crm_contacts → sales_orders → sales_order_lines
 *   warehouses   → deliveries → delivery_items
 *   crm_contacts → purchase_orders → purchase_order_lines
 *                → goods_receipts → goods_receipt_lines
 *   employees    → drivers; vehicles → trips → ...
 *   crm_contacts → projects → project_tasks, project_costs
 *   gib_envelopes → waybills → waybill_lines
 *   treasury_accounts → treasury_transactions
 *   boms → bom_lines; work_orders → work_order_operations
 */
export const V001_InitialTenantSchema: Migration = {
  version: 'V001',
  description: 'Initial tenant schema — squashed baseline (V001–V063)',
  checksum: 'squash-v001-v063-baseline-20260408',
  sql: `

    -- ─── 1. REFERANS TABLOLARI ────────────────────────────────────────────────

    -- Muhasebe hesap planı (TDHP)
    CREATE TABLE IF NOT EXISTS accounts (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID        NOT NULL,
      code           VARCHAR(20) NOT NULL,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(20) NOT NULL
                       CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE','MEMORANDUM')),
      normal_balance VARCHAR(6)  NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
      level          SMALLINT    NOT NULL CHECK (level IN (1,2,3)),
      is_postable    BOOLEAN     NOT NULL DEFAULT false,
      parent_code    VARCHAR(20),
      kdv_code       VARCHAR(10),
      is_active      BOOLEAN     NOT NULL DEFAULT true,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_tenant_code
      ON accounts (tenant_id, code);

    -- KDV oranları
    CREATE TABLE IF NOT EXISTS kdv_rates (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  UUID        NOT NULL,
      rate       NUMERIC(5,2) NOT NULL,
      name       VARCHAR(50) NOT NULL,
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Türkiye il/ilçe verileri
    CREATE TABLE IF NOT EXISTS cities (
      id         SMALLINT    PRIMARY KEY,
      tenant_id  UUID        NOT NULL,
      name       VARCHAR(100) NOT NULL,
      plate_code SMALLINT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS districts (
      id        SERIAL      PRIMARY KEY,
      tenant_id UUID        NOT NULL,
      city_id   SMALLINT    NOT NULL REFERENCES cities(id),
      name      VARCHAR(100) NOT NULL
    );

    -- ─── 2. KULLANICI VE ROL YÖNETİMİ ────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS roles (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID        NOT NULL,
      name        VARCHAR(50) NOT NULL,
      description TEXT,
      permissions JSONB       NOT NULL DEFAULT '[]',
      is_system   BOOLEAN     NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS users (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID        NOT NULL,
      email         VARCHAR(200) NOT NULL,
      name          VARCHAR(100) NOT NULL,
      password_hash TEXT        NOT NULL,
      is_active     BOOLEAN     NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, email)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    -- FCM cihaz tokenları
    CREATE TABLE IF NOT EXISTS device_tokens (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID        NOT NULL,
      user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id    VARCHAR(200) NOT NULL,
      fcm_token    TEXT        NOT NULL,
      platform     VARCHAR(10) NOT NULL CHECK (platform IN ('ios','android')),
      app_version  VARCHAR(20),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active    BOOLEAN     NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_device_tokens_user
      ON device_tokens (tenant_id, user_id) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_device_tokens_fcm
      ON device_tokens (fcm_token);

    -- ─── 3. CRM ──────────────────────────────────────────────────────────────

    -- Merged final state: V010 + V013 + V029
    CREATE TABLE IF NOT EXISTS crm_contacts (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID        NOT NULL,
      first_name   VARCHAR(100) NOT NULL,
      last_name    VARCHAR(100),           -- V013: nullable
      email        VARCHAR(200),
      phone        VARCHAR(30),
      company_name VARCHAR(200),
      job_title    VARCHAR(100),
      source       VARCHAR(30) CHECK (source IN ('referral','web','social','cold_call','other')),
      tags         JSONB       NOT NULL DEFAULT '[]',
      notes        TEXT,
      owner_user_id UUID,
      is_active    BOOLEAN     NOT NULL DEFAULT true,
      -- V013 additions
      contact_type VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
      vkn          VARCHAR(10),
      tckn         VARCHAR(11),
      address      TEXT,
      city         VARCHAR(100),
      district     VARCHAR(100),
      -- V029 additions
      tax_office   VARCHAR(100),
      mersis_no    VARCHAR(16),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant
      ON crm_contacts (tenant_id) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_email
      ON crm_contacts (tenant_id, email) WHERE email IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner
      ON crm_contacts (tenant_id, owner_user_id) WHERE owner_user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS crm_leads (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID        NOT NULL,
      contact_id          UUID        NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
      title               VARCHAR(200) NOT NULL,
      value_kurus         BIGINT      NOT NULL DEFAULT 0,
      stage               VARCHAR(30) NOT NULL DEFAULT 'new'
                            CHECK (stage IN ('new','qualified','proposal','negotiation','won','lost')),
      probability         SMALLINT    NOT NULL DEFAULT 20
                            CHECK (probability BETWEEN 0 AND 100),
      expected_close_date DATE,
      owner_user_id       UUID,
      notes               TEXT,
      closed_at           TIMESTAMPTZ,
      lost_reason         VARCHAR(200),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_stage
      ON crm_leads (tenant_id, stage);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_contact
      ON crm_leads (tenant_id, contact_id);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_owner
      ON crm_leads (tenant_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_crm_leads_close_date
      ON crm_leads (tenant_id, expected_close_date) WHERE stage NOT IN ('won','lost');

    CREATE TABLE IF NOT EXISTS crm_activities (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID        NOT NULL,
      lead_id       UUID        REFERENCES crm_leads(id) ON DELETE CASCADE,
      contact_id    UUID        NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
      type          VARCHAR(20) NOT NULL
                      CHECK (type IN ('call','meeting','email','task','note')),
      subject       VARCHAR(300) NOT NULL,
      body          TEXT,
      scheduled_at  TIMESTAMPTZ,
      completed_at  TIMESTAMPTZ,
      owner_user_id UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_activities_lead
      ON crm_activities (tenant_id, lead_id) WHERE lead_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_crm_activities_contact
      ON crm_activities (tenant_id, contact_id);
    CREATE INDEX IF NOT EXISTS idx_crm_activities_scheduled
      ON crm_activities (tenant_id, scheduled_at)
      WHERE scheduled_at IS NOT NULL AND completed_at IS NULL;

    -- ─── 4. İK (HUMAN CAPITAL MANAGEMENT) ───────────────────────────────────

    -- Merged final state: V009 + V018 + V059 + V060
    CREATE TABLE IF NOT EXISTS employees (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID        NOT NULL,
      sicil_no           VARCHAR(30) NOT NULL,
      tckn               VARCHAR(11),          -- V018: nullable
      sgk_no             VARCHAR(20),
      name               VARCHAR(100) NOT NULL,
      surname            VARCHAR(100) NOT NULL,
      gender             VARCHAR(10) CHECK (gender IN ('male','female')),
      birth_date         DATE,
      hire_date          DATE        NOT NULL,
      termination_date   DATE,
      department         VARCHAR(100),
      title              VARCHAR(100),
      gross_salary_kurus BIGINT      NOT NULL,
      salary_type        VARCHAR(10) NOT NULL DEFAULT 'monthly'
                           CHECK (salary_type IN ('monthly','hourly')),
      bank_iban          VARCHAR(34),
      disability_degree  SMALLINT    NOT NULL DEFAULT 0 CHECK (disability_degree IN (0,1,2,3)),
      status             VARCHAR(20) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','on_leave','terminated')),
      -- V018 additions
      email              VARCHAR(200),
      phone              VARCHAR(20),
      license_class      VARCHAR(5),
      license_number     VARCHAR(50),
      license_expires    DATE,
      -- V059 additions
      has_icra           BOOLEAN     NOT NULL DEFAULT false,
      icra_rate          NUMERIC(5,4) DEFAULT 0,
      icra_fixed_kurus   BIGINT      DEFAULT 0,
      bes_opt_out        BOOLEAN     NOT NULL DEFAULT false,
      -- V060 addition
      sgk_termination_code VARCHAR(2),
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, sicil_no)
    );
    CREATE INDEX IF NOT EXISTS idx_employees_tenant_status
      ON employees (tenant_id, status);

    -- Merged final state: V009 + V059
    CREATE TABLE IF NOT EXISTS payrolls (
      id                           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                    UUID     NOT NULL,
      employee_id                  UUID     NOT NULL REFERENCES employees(id),
      period_year                  SMALLINT NOT NULL,
      period_month                 SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
      working_days                 SMALLINT NOT NULL DEFAULT 30,
      total_days                   SMALLINT NOT NULL DEFAULT 30,
      gross_kurus                  BIGINT   NOT NULL,
      sgk_worker_kurus             BIGINT   NOT NULL DEFAULT 0,
      unemployment_worker_kurus    BIGINT   NOT NULL DEFAULT 0,
      income_tax_base_kurus        BIGINT   NOT NULL DEFAULT 0,
      income_tax_kurus             BIGINT   NOT NULL DEFAULT 0,
      stamp_tax_kurus              BIGINT   NOT NULL DEFAULT 0,
      min_wage_exemption_kurus     BIGINT   NOT NULL DEFAULT 0,
      net_kurus                    BIGINT   NOT NULL,
      sgk_employer_kurus           BIGINT   NOT NULL DEFAULT 0,
      unemployment_employer_kurus  BIGINT   NOT NULL DEFAULT 0,
      total_employer_cost_kurus    BIGINT   NOT NULL DEFAULT 0,
      cumulative_income_base_kurus BIGINT   NOT NULL DEFAULT 0,
      -- V059 additions
      bes_kurus                    BIGINT   NOT NULL DEFAULT 0,
      icra_kurus                   BIGINT   NOT NULL DEFAULT 0,
      advance_deduction_kurus      BIGINT   NOT NULL DEFAULT 0,
      overtime_kurus               BIGINT   NOT NULL DEFAULT 0,
      status                       VARCHAR(10) NOT NULL DEFAULT 'DRAFT'
                                     CHECK (status IN ('DRAFT','APPROVED','PAID')),
      approved_at                  TIMESTAMPTZ,
      approved_by                  UUID,
      paid_at                      TIMESTAMPTZ,
      notes                        TEXT,
      created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, employee_id, period_year, period_month)
    );
    CREATE INDEX IF NOT EXISTS idx_payrolls_tenant_period
      ON payrolls (tenant_id, period_year DESC, period_month DESC);
    CREATE INDEX IF NOT EXISTS idx_payrolls_employee
      ON payrolls (tenant_id, employee_id);

    -- Avans talepleri (V055)
    CREATE TABLE IF NOT EXISTS advances (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID        NOT NULL,
      employee_id     UUID        NOT NULL REFERENCES employees(id),
      advance_type    VARCHAR(20) NOT NULL DEFAULT 'MAAS_AVANSI',
      amount_kurus    BIGINT      NOT NULL CHECK (amount_kurus > 0),
      status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      reason          TEXT,
      requested_at    DATE        NOT NULL DEFAULT CURRENT_DATE,
      approved_by     UUID,
      approved_at     TIMESTAMPTZ,
      paid_at         TIMESTAMPTZ,
      deducted_at     TIMESTAMPTZ,
      payroll_id      UUID,
      rejected_by     UUID,
      rejected_reason TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_advances_employee
      ON advances (employee_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_advances_status
      ON advances (status, tenant_id)
      WHERE status IN ('PENDING','APPROVED','PAID');

    -- PDKS devam kayıtları (V056)
    CREATE TABLE IF NOT EXISTS attendance_records (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        UUID        NOT NULL,
      employee_id      UUID        NOT NULL REFERENCES employees(id),
      record_date      DATE        NOT NULL,
      attendance_type  VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
      check_in         TIMESTAMPTZ,
      check_out        TIMESTAMPTZ,
      worked_minutes   INT,
      leave_request_id UUID,
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, record_date, tenant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_employee_period
      ON attendance_records (employee_id, record_date, tenant_id);

    -- Fazla mesai (V057)
    CREATE TABLE IF NOT EXISTS overtime_entries (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID         NOT NULL,
      employee_id   UUID         NOT NULL REFERENCES employees(id),
      overtime_date DATE         NOT NULL,
      hours         NUMERIC(4,2) NOT NULL CHECK (hours > 0),
      multiplier    NUMERIC(3,2) NOT NULL DEFAULT 1.50,
      status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
      reason        TEXT,
      approved_by   UUID,
      approved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_overtime_employee_period
      ON overtime_entries (employee_id, overtime_date, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_status
      ON overtime_entries (status, tenant_id) WHERE status = 'PENDING';

    -- Zimmet takibi (V058)
    CREATE TABLE IF NOT EXISTS employee_assets (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID        NOT NULL,
      employee_id    UUID        NOT NULL REFERENCES employees(id),
      asset_name     VARCHAR(255) NOT NULL,
      asset_category VARCHAR(50),
      serial_number  VARCHAR(100),
      product_id     UUID,
      assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      returned_at    TIMESTAMPTZ,
      status         VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_employee_assets_employee
      ON employee_assets (employee_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_employee_assets_active
      ON employee_assets (employee_id, tenant_id) WHERE status = 'ASSIGNED';

    -- İzin talepleri (V023)
    CREATE TABLE IF NOT EXISTS leave_requests (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID        NOT NULL,
      employee_id       UUID        NOT NULL,
      leave_type        VARCHAR(30) NOT NULL,
      start_date        DATE        NOT NULL,
      end_date          DATE        NOT NULL,
      working_days      INT         NOT NULL DEFAULT 0,
      status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','cancelled')),
      approved_by       UUID,
      approved_at       TIMESTAMPTZ,
      notes             TEXT,
      medical_report_no VARCHAR(50),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant
      ON leave_requests (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
      ON leave_requests (tenant_id, employee_id);

    -- İzin bakiyeleri (V023)
    CREATE TABLE IF NOT EXISTS leave_balances (
      id                UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID     NOT NULL,
      employee_id       UUID     NOT NULL,
      year              SMALLINT NOT NULL,
      earned_days       INT      NOT NULL DEFAULT 0,
      carried_over_days INT      NOT NULL DEFAULT 0,
      used_days         INT      NOT NULL DEFAULT 0,
      pending_days      INT      NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_leave_balance UNIQUE (tenant_id, employee_id, year)
    );
    CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant
      ON leave_balances (tenant_id, employee_id);

    -- Masraf raporları (V024)
    CREATE TABLE IF NOT EXISTS expense_reports (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID        NOT NULL,
      employee_id   UUID        NOT NULL,
      employee_name VARCHAR(200) NOT NULL,
      period        VARCHAR(7)  NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'TASLAK'
                      CHECK (status IN ('TASLAK','ONAY_BEKLIYOR','ONAYLANDI','REDDEDILDI','ODENDI')),
      total_kurus   BIGINT      NOT NULL DEFAULT 0,
      currency      VARCHAR(3)  NOT NULL DEFAULT 'TRY',
      notes         TEXT,
      submitted_at  TIMESTAMPTZ,
      approved_by   UUID,
      approved_at   TIMESTAMPTZ,
      rejected_reason TEXT,
      paid_at       TIMESTAMPTZ,
      created_by    UUID        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_expense_reports_tenant
      ON expense_reports (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_expense_reports_employee
      ON expense_reports (tenant_id, employee_id);

    CREATE TABLE IF NOT EXISTS expense_lines (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id    UUID        NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      category     VARCHAR(20) NOT NULL,
      description  VARCHAR(300) NOT NULL,
      expense_date DATE        NOT NULL,
      amount_kurus BIGINT      NOT NULL,
      kdv_kurus    BIGINT      NOT NULL DEFAULT 0,
      receipt_url  VARCHAR(500),
      notes        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_expense_lines_report
      ON expense_lines (report_id);

    -- İşten çıkış detayları (V060)
    CREATE TABLE IF NOT EXISTS termination_details (
      id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            UUID         NOT NULL,
      employee_id          UUID         NOT NULL REFERENCES employees(id),
      termination_date     DATE         NOT NULL,
      sgk_termination_code VARCHAR(2)   NOT NULL,
      tenure_years         NUMERIC(6,2),
      tenure_months        INT,
      severance_eligible   BOOLEAN      NOT NULL DEFAULT false,
      severance_kurus      BIGINT       NOT NULL DEFAULT 0,
      severance_days       INT          NOT NULL DEFAULT 0,
      notice_eligible      BOOLEAN      NOT NULL DEFAULT false,
      notice_kurus         BIGINT       NOT NULL DEFAULT 0,
      notice_weeks         INT          NOT NULL DEFAULT 0,
      unused_leave_days    NUMERIC(5,2) NOT NULL DEFAULT 0,
      unused_leave_kurus   BIGINT       NOT NULL DEFAULT 0,
      total_payout_kurus   BIGINT       NOT NULL DEFAULT 0,
      calculated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      calculated_by        UUID,
      notes                TEXT,
      created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_termination_details_employee
      ON termination_details (employee_id, tenant_id);

    -- HR event outbox (V061)
    CREATE TABLE IF NOT EXISTS hr_outbox (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID        NOT NULL,
      event_type   VARCHAR(50) NOT NULL,
      aggregate_id UUID        NOT NULL,
      payload      JSONB       NOT NULL,
      status       VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      published_at TIMESTAMPTZ,
      retry_count  INT         NOT NULL DEFAULT 0,
      last_error   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hr_outbox_pending
      ON hr_outbox (status, created_at) WHERE status = 'PENDING';

    -- ─── 5. STOK YÖNETİMİ ────────────────────────────────────────────────────

    -- Final state: V012 (V003 DROP+CREATE)
    CREATE TABLE IF NOT EXISTS warehouses (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  UUID        NOT NULL,
      code       VARCHAR(20) NOT NULL,
      name       VARCHAR(100) NOT NULL,
      address    TEXT,
      city       VARCHAR(100),
      is_virtual BOOLEAN     NOT NULL DEFAULT false,
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  UUID        NOT NULL,
      name       VARCHAR(100) NOT NULL,
      code       VARCHAR(20) NOT NULL,
      parent_id  UUID        REFERENCES product_categories(id),
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS products (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID         NOT NULL,
      sku                 VARCHAR(50)  NOT NULL,
      name                VARCHAR(200) NOT NULL,
      description         TEXT,
      category_id         UUID         REFERENCES product_categories(id),
      unit_code           VARCHAR(10)  NOT NULL DEFAULT 'C62',
      barcode             VARCHAR(50),
      kdv_rate            NUMERIC(5,2) NOT NULL DEFAULT 20,
      is_stock_tracked    BOOLEAN      NOT NULL DEFAULT true,
      cost_method         VARCHAR(10)  NOT NULL DEFAULT 'AVG',
      avg_unit_cost_kurus BIGINT       NOT NULL DEFAULT 0,
      fifo_layers         JSONB        NOT NULL DEFAULT '[]',
      total_stock_qty     NUMERIC(15,4) NOT NULL DEFAULT 0,
      reorder_point       NUMERIC(15,4) NOT NULL DEFAULT 0,
      min_stock_qty       NUMERIC(15,4) NOT NULL DEFAULT 0,
      list_price_kurus    BIGINT       NOT NULL DEFAULT 0,
      is_active           BOOLEAN      NOT NULL DEFAULT true,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, sku)
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode
      ON products (tenant_id, barcode) WHERE barcode IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_sku
      ON products (tenant_id, sku);

    CREATE TABLE IF NOT EXISTS stock_movements (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID         NOT NULL,
      product_id          UUID         NOT NULL REFERENCES products(id),
      warehouse_id        UUID         NOT NULL REFERENCES warehouses(id),
      target_warehouse_id UUID         REFERENCES warehouses(id),
      type                VARCHAR(20)  NOT NULL
                            CHECK (type IN ('GIRIS','CIKIS','TRANSFER','SAYIM','IADE_GIRIS','IADE_CIKIS','FIRE')),
      quantity            NUMERIC(15,4) NOT NULL,
      unit_cost_kurus     BIGINT       NOT NULL DEFAULT 0,
      total_cost_kurus    BIGINT       NOT NULL DEFAULT 0,
      running_balance     NUMERIC(15,4) NOT NULL DEFAULT 0,
      reference_type      VARCHAR(50),
      reference_id        VARCHAR(255),
      notes               TEXT,
      created_by          VARCHAR(255) NOT NULL,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date
      ON stock_movements (tenant_id, product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse
      ON stock_movements (tenant_id, warehouse_id, created_at DESC);

    -- ─── 6. MARKETPLACE / E-TİCARET ──────────────────────────────────────────

    -- Platform entegrasyon (V007)
    CREATE TABLE IF NOT EXISTS marketplace_integrations (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID        NOT NULL,
      platform        VARCHAR(30) NOT NULL
                        CHECK (platform IN ('TRENDYOL','HEPSIBURADA','N11','AMAZON_TR','CICEKSEPETI')),
      credentials_enc JSONB       NOT NULL,
      config          JSONB       NOT NULL DEFAULT '{}',
      is_active       BOOLEAN     NOT NULL DEFAULT true,
      last_sync_at    TIMESTAMPTZ,
      last_sync_error TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, platform)
    );

    CREATE TABLE IF NOT EXISTS marketplace_orders (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID        NOT NULL,
      platform           VARCHAR(30) NOT NULL,
      platform_order_id  VARCHAR(100) NOT NULL,
      platform_order_no  VARCHAR(100),
      status             VARCHAR(30) NOT NULL DEFAULT 'NEW'
                           CHECK (status IN ('NEW','PICKING','SHIPPED','DELIVERED','CANCELLED','RETURNED')),
      customer_name      VARCHAR(200),
      cargo_tracking_no  VARCHAR(100),
      gross_amount_kurus BIGINT      NOT NULL DEFAULT 0,
      stock_movement_id  UUID,
      raw_payload        JSONB,
      ordered_at         TIMESTAMPTZ,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, platform, platform_order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_orders_tenant_status
      ON marketplace_orders (tenant_id, platform, status);
    CREATE INDEX IF NOT EXISTS idx_marketplace_orders_ordered_at
      ON marketplace_orders (tenant_id, ordered_at DESC);

    CREATE TABLE IF NOT EXISTS marketplace_order_lines (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        UUID        NOT NULL,
      order_id         UUID        NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
      platform_line_id VARCHAR(100),
      product_id       UUID,
      platform_sku     VARCHAR(100) NOT NULL,
      platform_barcode VARCHAR(100),
      product_name     VARCHAR(300) NOT NULL,
      quantity         NUMERIC(10,2) NOT NULL,
      unit_price_kurus BIGINT      NOT NULL DEFAULT 0,
      commission_kurus BIGINT      NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_mol_order_id
      ON marketplace_order_lines (tenant_id, order_id);

    -- e-Ticaret entegrasyonu (V045)
    CREATE TABLE IF NOT EXISTS ecommerce_integrations (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID        NOT NULL,
      platform        VARCHAR(20) NOT NULL,
      name            VARCHAR(100) NOT NULL,
      store_url       VARCHAR(500) NOT NULL,
      credentials     JSONB       NOT NULL DEFAULT '{}',
      is_active       BOOLEAN     NOT NULL DEFAULT true,
      sync_products   BOOLEAN     NOT NULL DEFAULT true,
      sync_stock      BOOLEAN     NOT NULL DEFAULT true,
      sync_orders     BOOLEAN     NOT NULL DEFAULT true,
      last_synced_at  TIMESTAMPTZ,
      last_sync_error TEXT,
      sync_since      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ecommerce_integrations_tenant_id
      ON ecommerce_integrations (tenant_id);

    -- ─── 7. GİB ZARFLARI (ÖNCE — invoices/waybills'ten FK alır) ─────────────

    -- Final state: V046 + V051
    CREATE TABLE IF NOT EXISTS gib_envelopes (
      id                         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                  UUID         NOT NULL,
      type                       VARCHAR(30)  NOT NULL
                                   CHECK (type IN ('SENDERENVELOPE','POSTBOXENVELOPE','SYSTEMENVELOPE')),
      direction                  VARCHAR(3)   NOT NULL CHECK (direction IN ('IN','OUT')),
      sender_alias               VARCHAR(200) NOT NULL,
      receiver_alias             VARCHAR(200) NOT NULL,
      document_ids               UUID[]       NOT NULL DEFAULT '{}',
      zip_md5_hash               VARCHAR(64),
      zip_sha256_hash            VARCHAR(64),
      zip_filename               VARCHAR(255),
      gib_status_code            INTEGER,
      gib_status_message         VARCHAR(500),
      status                     VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                                   CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED')),
      sent_at                    TIMESTAMPTZ,
      last_polled_at             TIMESTAMPTZ,
      next_poll_at               TIMESTAMPTZ,
      poll_attempt_count         INTEGER      NOT NULL DEFAULT 0,
      raw_gib_response           TEXT,
      -- V051 additions
      cancellation_requested_at  TIMESTAMPTZ,
      cancellation_requested_by  UUID,
      cancellation_portal_ref    VARCHAR(100),
      created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gib_envelopes_tenant_id
      ON gib_envelopes (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_gib_envelopes_status
      ON gib_envelopes (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_gib_envelopes_next_poll
      ON gib_envelopes (tenant_id, next_poll_at) WHERE status = 'PROCESSING';

    -- ─── 8. FİNANS ───────────────────────────────────────────────────────────

    -- Final merged state: V004 + V019 (drop FKs) + V021 (counterparty_id)
    --   + V046 (envelope_uuid, profile_id, invoice_type_code, document_number, commercial_status)
    --   + V048 (document_behavior) + V051 (cancellation fields)
    --   + V053 (purchase_order_id, po_match_status) + V054 (sales_order_id)
    --
    -- customer_id ve vendor_id: FK kısıtlamaları V019'da kaldırıldı (customers/vendors tabloları yok)
    CREATE TABLE IF NOT EXISTS invoices (
      id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID         NOT NULL,
      gib_uuid           UUID         UNIQUE,
      invoice_number     VARCHAR(50)  NOT NULL,
      invoice_type       VARCHAR(20)  NOT NULL
                           CHECK (invoice_type IN ('E_FATURA','E_ARSIV','PURCHASE','PROFORMA')),
      direction          VARCHAR(3)   NOT NULL CHECK (direction IN ('OUT','IN')),
      status             VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT','PENDING_GIB','SENT_GIB','ACCEPTED_GIB','REJECTED_GIB','CANCELLED')),
      customer_id        UUID,        -- FK kaldırıldı (V019); crm_contacts referansı
      vendor_id          UUID,        -- FK kaldırıldı (V019); crm_contacts referansı
      counterparty_id    UUID,        -- V021: birleşik taraf referansı
      issue_date         DATE         NOT NULL,
      due_date           DATE,
      subtotal           NUMERIC(19,4) NOT NULL DEFAULT 0,
      kdv_total          NUMERIC(19,4) NOT NULL DEFAULT 0,
      discount_total     NUMERIC(19,4) NOT NULL DEFAULT 0,
      total              NUMERIC(19,4) NOT NULL DEFAULT 0,
      currency           CHAR(3)      NOT NULL DEFAULT 'TRY',
      exchange_rate      NUMERIC(10,6) NOT NULL DEFAULT 1,
      notes              TEXT,
      gib_response       JSONB,
      created_by         UUID         NOT NULL,
      -- V046 additions (GİB EF-VAP)
      envelope_uuid      UUID         REFERENCES gib_envelopes(id),
      profile_id         VARCHAR(30)
                           CHECK (profile_id IN
                             ('TEMELFATURA','TICARIFATURA','EARSIVFATURA',
                              'ENERJI','ILAC_TIBBICIHAZ','IDIS','SGK')),
      invoice_type_code  VARCHAR(20)
                           CHECK (invoice_type_code IN ('SATIS','IADE','TEVKIFAT','SARJ','SARJANLIK')),
      document_number    VARCHAR(16),
      commercial_status  VARCHAR(20)  DEFAULT 'BEKLIYOR'
                           CHECK (commercial_status IN ('BEKLIYOR','KABUL','RED')),
      -- V048 addition
      document_behavior  VARCHAR(10)
                           CHECK (document_behavior IN ('ENVELOPE','REPORTING')),
      -- V051 additions
      cancellation_reason TEXT,
      cancelled_by       UUID,
      cancelled_at       TIMESTAMPTZ,
      -- V053 additions (PO eşleştirme)
      purchase_order_id  UUID,
      po_match_status    VARCHAR(20),
      -- V054 addition
      sales_order_id     UUID,
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, invoice_number)
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date
      ON invoices (tenant_id, issue_date DESC);
    CREATE INDEX IF NOT EXISTS idx_invoices_status
      ON invoices (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer
      ON invoices (tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_envelope_uuid
      ON invoices (envelope_uuid) WHERE envelope_uuid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order
      ON invoices (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_sales_order_unique
      ON invoices (sales_order_id, tenant_id)
      WHERE sales_order_id IS NOT NULL AND status != 'CANCELLED';
    CREATE INDEX IF NOT EXISTS idx_invoices_sales_order
      ON invoices (sales_order_id) WHERE sales_order_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID         NOT NULL,
      invoice_id   UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      line_number  SMALLINT     NOT NULL,
      product_id   UUID         REFERENCES products(id),
      description  VARCHAR(500) NOT NULL,
      quantity     NUMERIC(19,4) NOT NULL,
      unit         VARCHAR(20)  NOT NULL DEFAULT 'adet',
      unit_price   NUMERIC(19,4) NOT NULL,
      discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      kdv_rate     NUMERIC(5,2) NOT NULL,
      kdv_amount   NUMERIC(19,4) NOT NULL,
      line_total   NUMERIC(19,4) NOT NULL
    );

    -- Muhasebe yevmiye defteri
    CREATE TABLE IF NOT EXISTS journal_entries (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID        NOT NULL,
      entry_number   VARCHAR(30) NOT NULL,
      entry_date     DATE        NOT NULL,
      description    TEXT        NOT NULL,
      reference_type VARCHAR(30),
      reference_id   UUID,
      is_posted      BOOLEAN     NOT NULL DEFAULT false,
      posted_at      TIMESTAMPTZ,
      posted_by      UUID,
      created_by     UUID        NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, entry_number)
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID         NOT NULL,
      entry_id      UUID         NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_code  VARCHAR(20)  NOT NULL,
      description   TEXT,
      debit_amount  NUMERIC(19,4) NOT NULL DEFAULT 0,
      credit_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
      CONSTRAINT chk_debit_or_credit
        CHECK (
          (debit_amount > 0 AND credit_amount = 0) OR
          (credit_amount > 0 AND debit_amount = 0)
        )
    );
    CREATE INDEX IF NOT EXISTS idx_jel_account
      ON journal_entry_lines (tenant_id, account_code);

    -- Ödeme planları (V011)
    CREATE TABLE IF NOT EXISTS payment_plans (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID         NOT NULL,
      invoice_id      UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      installment_cnt SMALLINT     NOT NULL DEFAULT 1,
      total_amount    NUMERIC(19,4) NOT NULL,
      notes           TEXT,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, invoice_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pp_invoice
      ON payment_plans (tenant_id, invoice_id);

    CREATE TABLE IF NOT EXISTS payment_installments (
      id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID         NOT NULL,
      plan_id        UUID         NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
      installment_no SMALLINT     NOT NULL,
      due_date       DATE         NOT NULL,
      amount         NUMERIC(19,4) NOT NULL,
      paid_at        TIMESTAMPTZ,
      payment_ref    VARCHAR(100),
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, plan_id, installment_no)
    );
    CREATE INDEX IF NOT EXISTS idx_pi_plan
      ON payment_installments (tenant_id, plan_id);
    CREATE INDEX IF NOT EXISTS idx_pi_due_pending
      ON payment_installments (tenant_id, due_date) WHERE paid_at IS NULL;

    CREATE TABLE IF NOT EXISTS payment_reminder_logs (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID        NOT NULL,
      installment_id UUID        NOT NULL REFERENCES payment_installments(id) ON DELETE CASCADE,
      level          VARCHAR(20) NOT NULL,
      channel        VARCHAR(20) NOT NULL DEFAULT 'push',
      sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, installment_id, level)
    );
    CREATE INDEX IF NOT EXISTS idx_prl_installment
      ON payment_reminder_logs (tenant_id, installment_id);

    -- GİB Kabul/Red yanıtları (V047)
    CREATE TABLE IF NOT EXISTS application_responses (
      id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            UUID         NOT NULL,
      invoice_id           UUID         NOT NULL REFERENCES invoices(id),
      invoice_envelope_id  UUID         REFERENCES gib_envelopes(id),
      response_envelope_id UUID         REFERENCES gib_envelopes(id),
      response_type        VARCHAR(10)  NOT NULL CHECK (response_type IN ('KABUL','RED')),
      rejection_reason     TEXT,
      created_by           UUID         NOT NULL,
      status               VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                             CHECK (status IN ('DRAFT','SENT','FAILED')),
      ubl_xml              TEXT,
      error_message        TEXT,
      created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_application_responses_tenant_id
      ON application_responses (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_application_responses_invoice_id
      ON application_responses (invoice_id);

    -- e-Arşiv raporlama (V048 + V050)
    CREATE TABLE IF NOT EXISTS e_archive_reports (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id            UUID        NOT NULL,
      report_date          DATE        NOT NULL,
      invoice_count        INTEGER     NOT NULL DEFAULT 0,
      invoice_ids          UUID[]      NOT NULL DEFAULT '{}',
      status               VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                             CHECK (status IN ('PENDING','SUCCESS','FAILED')),
      gib_response         JSONB,
      sent_at              TIMESTAMPTZ,
      -- V050 additions
      retry_count          INTEGER     NOT NULL DEFAULT 0,
      last_error           TEXT,
      gib_reference_number VARCHAR(50),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_e_archive_reports_tenant_date UNIQUE (tenant_id, report_date)
    );
    CREATE INDEX IF NOT EXISTS idx_e_archive_reports_tenant_date
      ON e_archive_reports (tenant_id, report_date);
    CREATE INDEX IF NOT EXISTS idx_e_archive_reports_status
      ON e_archive_reports (status) WHERE status != 'SUCCESS';

    -- e-Defter gönderim kayıtları (V006)
    CREATE TABLE IF NOT EXISTS edefter_submissions (
      id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID     NOT NULL,
      donem_yil    SMALLINT NOT NULL,
      donem_ay     SMALLINT NOT NULL CHECK (donem_ay BETWEEN 1 AND 12),
      submitted_at TIMESTAMPTZ,
      gib_response JSONB,
      is_balanced  BOOLEAN  NOT NULL DEFAULT false,
      berat_hash   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, donem_yil, donem_ay)
    );
    CREATE INDEX IF NOT EXISTS idx_edefter_tenant_donem
      ON edefter_submissions (tenant_id, donem_yil DESC, donem_ay DESC);

    -- Duran varlıklar (V026)
    CREATE TABLE IF NOT EXISTS fixed_assets (
      id                             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                      UUID         NOT NULL,
      name                           VARCHAR(200) NOT NULL,
      asset_code                     VARCHAR(50)  NOT NULL,
      category                       VARCHAR(30)  NOT NULL,
      depreciation_method            VARCHAR(20)  NOT NULL DEFAULT 'NORMAL',
      useful_life_years              SMALLINT     NOT NULL DEFAULT 0,
      depreciation_rate              NUMERIC(8,6) NOT NULL DEFAULT 0,
      acquisition_date               DATE         NOT NULL,
      acquisition_cost_kurus         BIGINT       NOT NULL DEFAULT 0,
      accumulated_depreciation_kurus BIGINT       NOT NULL DEFAULT 0,
      book_value_kurus               BIGINT       NOT NULL DEFAULT 0,
      salvage_value_kurus            BIGINT       NOT NULL DEFAULT 0,
      invoice_id                     UUID,
      location                       VARCHAR(100),
      status                         VARCHAR(25)  NOT NULL DEFAULT 'AKTIF',
      disposal_date                  DATE,
      disposal_notes                 TEXT,
      created_by                     VARCHAR(100),
      created_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at                     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant
      ON fixed_assets (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_status
      ON fixed_assets (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_category
      ON fixed_assets (tenant_id, category);

    CREATE TABLE IF NOT EXISTS asset_depreciations (
      id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                UUID        NOT NULL,
      asset_id                 UUID        NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
      year                     SMALLINT    NOT NULL,
      depreciation_kurus       BIGINT      NOT NULL DEFAULT 0,
      opening_book_value_kurus BIGINT      NOT NULL DEFAULT 0,
      closing_book_value_kurus BIGINT      NOT NULL DEFAULT 0,
      method                   VARCHAR(20) NOT NULL,
      journal_entry_id         UUID,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (asset_id, year)
    );
    CREATE INDEX IF NOT EXISTS idx_asset_depreciations_asset
      ON asset_depreciations (asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_depreciations_tenant
      ON asset_depreciations (tenant_id);

    -- Bütçe tabloları (V027)
    CREATE TABLE IF NOT EXISTS budgets (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID        NOT NULL,
      year        INTEGER     NOT NULL,
      version     VARCHAR(20) NOT NULL DEFAULT 'v1',
      name        VARCHAR(200) NOT NULL,
      is_approved BOOLEAN     NOT NULL DEFAULT false,
      approved_by VARCHAR(100),
      approved_at TIMESTAMPTZ,
      notes       TEXT,
      created_by  VARCHAR(100),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, year, version)
    );
    CREATE INDEX IF NOT EXISTS idx_budgets_tenant ON budgets (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_year   ON budgets (tenant_id, year);

    CREATE TABLE IF NOT EXISTS budget_lines (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_id          UUID        NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      account_code       VARCHAR(20) NOT NULL,
      account_name       VARCHAR(200) NOT NULL,
      jan                BIGINT      NOT NULL DEFAULT 0,
      feb                BIGINT      NOT NULL DEFAULT 0,
      mar                BIGINT      NOT NULL DEFAULT 0,
      apr                BIGINT      NOT NULL DEFAULT 0,
      may                BIGINT      NOT NULL DEFAULT 0,
      jun                BIGINT      NOT NULL DEFAULT 0,
      jul                BIGINT      NOT NULL DEFAULT 0,
      aug                BIGINT      NOT NULL DEFAULT 0,
      sep                BIGINT      NOT NULL DEFAULT 0,
      oct                BIGINT      NOT NULL DEFAULT 0,
      nov                BIGINT      NOT NULL DEFAULT 0,
      dec                BIGINT      NOT NULL DEFAULT 0,
      annual_total_kurus BIGINT      NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines (budget_id);

    -- Döviz kurları (V034 final — V022 DROP+CREATE)
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID         NOT NULL,
      from_currency VARCHAR(3)   NOT NULL,
      to_currency   VARCHAR(3)   NOT NULL,
      rate          NUMERIC(18,6) NOT NULL,
      source        VARCHAR(50)  NOT NULL DEFAULT 'MANUAL',
      rate_date     DATE         NOT NULL,
      created_by    VARCHAR(100),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, from_currency, to_currency, rate_date)
    );
    CREATE INDEX IF NOT EXISTS idx_exchange_rates_tenant
      ON exchange_rates (tenant_id, rate_date DESC);

    -- Denetim izi (V033)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          BIGSERIAL    PRIMARY KEY,
      tenant_id   UUID         NOT NULL,
      user_id     UUID,
      action      VARCHAR(50)  NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id   VARCHAR(100),
      old_values  JSONB,
      new_values  JSONB,
      ip_address  INET,
      user_agent  VARCHAR(500),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
      ON audit_logs (tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
      ON audit_logs (tenant_id, entity_type, entity_id);

    -- Bildirimler (V028)
    CREATE TABLE IF NOT EXISTS notifications (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID        NOT NULL,
      category    VARCHAR(10) NOT NULL CHECK (category IN ('finans','stok','ik','sistem')),
      level       VARCHAR(10) NOT NULL CHECK (level IN ('error','warning','info','success')),
      title       VARCHAR(200) NOT NULL,
      body        VARCHAR(500) NOT NULL,
      href        VARCHAR(200),
      source_type VARCHAR(50),
      source_id   VARCHAR(100),
      is_read     BOOLEAN     NOT NULL DEFAULT false,
      read_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread
      ON notifications (tenant_id, is_read, created_at DESC);

    -- ─── 9. TEDARİKÇİLER (V029 final — V002+V021 DROP, V029 yeniden oluştur) ─

    CREATE TABLE IF NOT EXISTS vendors (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID        NOT NULL,
      code          VARCHAR(30) NOT NULL,
      name          VARCHAR(200) NOT NULL,
      tax_id        VARCHAR(10),
      tax_office    VARCHAR(100),
      address       TEXT,
      city_id       SMALLINT    REFERENCES cities(id),
      phone         VARCHAR(20),
      email         VARCHAR(200),
      iban          VARCHAR(34),
      payment_terms SMALLINT    DEFAULT 30,
      mersis_no     VARCHAR(16),
      is_active     BOOLEAN     NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors (tenant_id);

    -- ─── 10. SATIŞ SİPARİŞLERİ (V031 final + V040 deliveries) ───────────────

    CREATE TABLE IF NOT EXISTS sales_orders (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        UUID        NOT NULL,
      order_number     VARCHAR(50) NOT NULL,
      customer_id      UUID        REFERENCES crm_contacts(id),
      status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','confirmed','processing','shipped','delivered','cancelled')),
      order_date       DATE        NOT NULL,
      delivery_date    DATE,
      delivery_address TEXT,
      notes            TEXT,
      total_kurus      BIGINT      NOT NULL DEFAULT 0,
      kdv_kurus        BIGINT      NOT NULL DEFAULT 0,
      created_by       UUID        NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, order_number)
    );
    CREATE INDEX IF NOT EXISTS idx_sales_orders_tenant
      ON sales_orders (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer
      ON sales_orders (customer_id);

    CREATE TABLE IF NOT EXISTS sales_order_lines (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      sales_order_id   UUID         NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      tenant_id        UUID         NOT NULL,
      product_id       UUID         REFERENCES products(id),
      description      VARCHAR(300) NOT NULL,
      quantity         NUMERIC(15,3) NOT NULL,
      unit             VARCHAR(20)  NOT NULL DEFAULT 'ADET',
      unit_price_kurus BIGINT       NOT NULL,
      kdv_rate         NUMERIC(5,2) NOT NULL DEFAULT 20,
      discount_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,
      line_total_kurus BIGINT       NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order
      ON sales_order_lines (sales_order_id);

    -- Final state: V031 + V040 (items JSONB + fleet/stock_sync columns)
    CREATE TABLE IF NOT EXISTS deliveries (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        UUID        NOT NULL,
      delivery_number  VARCHAR(50) NOT NULL,
      sales_order_id   UUID        REFERENCES sales_orders(id),
      warehouse_id     UUID        REFERENCES warehouses(id),
      status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','dispatched','delivered','returned')),
      delivery_date    DATE,
      carrier          VARCHAR(100),
      tracking_number  VARCHAR(100),
      notes            TEXT,
      -- V040 additions
      items            JSONB       NOT NULL DEFAULT '[]',
      vehicle_id       UUID,
      driver_id        UUID,
      trip_id          UUID,
      stock_synced     BOOLEAN     NOT NULL DEFAULT false,
      stock_sync_error TEXT,
      created_by       UUID        NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, delivery_number)
    );
    CREATE INDEX IF NOT EXISTS idx_deliveries_tenant
      ON deliveries (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_order
      ON deliveries (sales_order_id);

    CREATE TABLE IF NOT EXISTS delivery_items (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      delivery_id   UUID         NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      order_line_id UUID         REFERENCES sales_order_lines(id),
      product_id    UUID         REFERENCES products(id),
      quantity      NUMERIC(15,3) NOT NULL,
      unit          VARCHAR(20)  NOT NULL DEFAULT 'ADET',
      lot_number    VARCHAR(100),
      serial_number VARCHAR(100)
    );

    -- ─── 11. SATIN ALMA (V030 + V039 + V062 FK + V063 vendor_name) ───────────

    -- vendor_id FK: V030'da vendors(id), V062'de crm_contacts(id)'a değiştirildi
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID        NOT NULL,
      order_number VARCHAR(50) NOT NULL,
      vendor_id    UUID        NOT NULL REFERENCES crm_contacts(id),  -- V062: vendors→crm_contacts
      vendor_name  VARCHAR(200),                                        -- V063 snapshot kolonu
      status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','sent','partial','received','cancelled')),
      order_date   DATE        NOT NULL,
      expected_date DATE,
      notes        TEXT,
      total_kurus  BIGINT      NOT NULL DEFAULT 0,
      kdv_kurus    BIGINT      NOT NULL DEFAULT 0,
      created_by   UUID        NOT NULL,
      approved_by  UUID,
      approved_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, order_number)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant
      ON purchase_orders (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor
      ON purchase_orders (vendor_id);

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_order_id UUID         NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      tenant_id         UUID         NOT NULL,
      product_id        UUID         REFERENCES products(id),
      description       VARCHAR(300) NOT NULL,
      quantity          NUMERIC(15,3) NOT NULL,
      unit              VARCHAR(20)  NOT NULL DEFAULT 'ADET',
      unit_price_kurus  BIGINT       NOT NULL,
      kdv_rate          NUMERIC(5,2) NOT NULL DEFAULT 20,
      line_total_kurus  BIGINT       NOT NULL,
      received_qty      NUMERIC(15,3) NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_order
      ON purchase_order_lines (purchase_order_id);

    -- Final state: V030 + V039 (items JSONB + stock_sync columns)
    CREATE TABLE IF NOT EXISTS goods_receipts (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID        NOT NULL,
      receipt_number    VARCHAR(50) NOT NULL,
      purchase_order_id UUID        REFERENCES purchase_orders(id),
      warehouse_id      UUID        REFERENCES warehouses(id),
      receipt_date      DATE        NOT NULL,
      notes             TEXT,
      -- V039 additions
      items             JSONB       NOT NULL DEFAULT '[]',
      stock_synced      BOOLEAN     NOT NULL DEFAULT false,
      stock_sync_error  TEXT,
      created_by        UUID        NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, receipt_number)
    );
    CREATE INDEX IF NOT EXISTS idx_goods_receipts_tenant
      ON goods_receipts (tenant_id);

    CREATE TABLE IF NOT EXISTS goods_receipt_lines (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id    UUID         NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
      order_line_id UUID         REFERENCES purchase_order_lines(id),
      product_id    UUID         REFERENCES products(id),
      quantity      NUMERIC(15,3) NOT NULL,
      unit          VARCHAR(20)  NOT NULL DEFAULT 'ADET',
      lot_number    VARCHAR(100),
      expiry_date   DATE
    );

    -- ─── 12. FİLO YÖNETİMİ (V036 + V043 + V044) ─────────────────────────────

    -- Final state: V036 schema + V044 additions (brand, volume_m3, assigned_warehouse_id, current_km)
    CREATE TABLE IF NOT EXISTS vehicles (
      id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id                 UUID         NOT NULL,
      vehicle_number            VARCHAR(50),
      plate                     VARCHAR(20)  NOT NULL,
      make                      VARCHAR(100),
      model                     VARCHAR(100),
      -- V044 addition
      brand                     VARCHAR(100),
      year                      SMALLINT,
      type                      VARCHAR(30)  NOT NULL DEFAULT 'KAMYON'
                                  CHECK (type IN ('TIR','KAMYON','KAMYONET','PICKUP','FORKLIFT','DIGER')),
      status                    VARCHAR(20)  NOT NULL DEFAULT 'AKTIF'
                                  CHECK (status IN ('AKTIF','PASIF','BAKIMDA')),
      fuel_type                 VARCHAR(20)  DEFAULT 'DIESEL',
      capacity_kg               NUMERIC(10,2),
      -- V044 addition
      volume_m3                 NUMERIC(10,2),
      vin                       VARCHAR(50),
      engine_number             VARCHAR(50),
      color                     VARCHAR(50),
      registration_expires      DATE,
      inspection_expires        DATE,
      insurance_expires         DATE,
      traffic_insurance_expires DATE,
      gps_device_id             VARCHAR(100),
      gps_provider              VARCHAR(50),
      last_lat                  NUMERIC(10,7),
      last_lng                  NUMERIC(10,7),
      last_speed_kmh            NUMERIC(5,1),
      last_location_at          TIMESTAMPTZ,
      -- V044 addition
      assigned_warehouse_id     VARCHAR(36),
      current_km                INT          NOT NULL DEFAULT 0,
      created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, plate)
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_tenant
      ON vehicles (tenant_id, status);

    -- Final state: V036 schema + V044 additions (first_name, last_name, current_vehicle_id)
    CREATE TABLE IF NOT EXISTS drivers (
      id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID         NOT NULL,
      employee_id        UUID         REFERENCES employees(id),
      full_name          VARCHAR(200),
      -- V044 additions
      first_name         VARCHAR(100),
      last_name          VARCHAR(100),
      tckn               VARCHAR(11),
      license_number     VARCHAR(50)  NOT NULL,
      license_class      VARCHAR(10)  NOT NULL DEFAULT 'B',
      license_expires    DATE,
      phone              VARCHAR(20),
      status             VARCHAR(20)  NOT NULL DEFAULT 'AKTIF'
                           CHECK (status IN ('AKTIF','PASIF','IZINDE')),
      current_vehicle_id VARCHAR(36),
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_drivers_tenant
      ON drivers (tenant_id, status);

    -- Final state: V036 + V044 (start_km, end_km)
    CREATE TABLE IF NOT EXISTS trips (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID         NOT NULL,
      trip_number       VARCHAR(30)  NOT NULL,
      vehicle_id        UUID         NOT NULL REFERENCES vehicles(id),
      driver_id         UUID         NOT NULL REFERENCES drivers(id),
      sales_order_id    UUID         REFERENCES sales_orders(id),
      delivery_id       UUID         REFERENCES deliveries(id),
      status            VARCHAR(20)  NOT NULL DEFAULT 'planned'
                          CHECK (status IN ('planned','in_progress','completed','cancelled')),
      origin            VARCHAR(300),
      destination       VARCHAR(300),
      planned_departure TIMESTAMPTZ,
      actual_departure  TIMESTAMPTZ,
      planned_arrival   TIMESTAMPTZ,
      actual_arrival    TIMESTAMPTZ,
      -- V044 additions
      start_km          INT,
      end_km            INT,
      distance_km       NUMERIC(10,2),
      notes             TEXT,
      created_by        VARCHAR(100),
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, trip_number)
    );
    CREATE INDEX IF NOT EXISTS idx_trips_tenant
      ON trips (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_trips_vehicle
      ON trips (vehicle_id);

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID         NOT NULL,
      vehicle_id        UUID         NOT NULL REFERENCES vehicles(id),
      type              VARCHAR(30)  NOT NULL
                          CHECK (type IN ('ROUTINE','REPAIR','INSPECTION','TIRE','INSURANCE','REGISTRATION','OTHER')),
      description       VARCHAR(300) NOT NULL,
      maintenance_date  DATE         NOT NULL,
      odometer_km       NUMERIC(10,2),
      cost_kurus        BIGINT       NOT NULL DEFAULT 0,
      vendor_name       VARCHAR(200),
      invoice_number    VARCHAR(100),
      next_due_date     DATE,
      next_due_km       NUMERIC(10,2),
      notes             TEXT,
      created_by        VARCHAR(100),
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_maintenance_tenant
      ON maintenance_records (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle
      ON maintenance_records (vehicle_id, maintenance_date DESC);

    CREATE TABLE IF NOT EXISTS fuel_records (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        UUID         NOT NULL,
      vehicle_id       UUID         NOT NULL REFERENCES vehicles(id),
      driver_id        UUID         REFERENCES drivers(id),
      fuel_date        DATE         NOT NULL,
      liters           NUMERIC(8,2) NOT NULL,
      unit_price_kurus BIGINT       NOT NULL,
      total_kurus      BIGINT       NOT NULL,
      odometer_km      NUMERIC(10,2),
      fuel_type        VARCHAR(20)  NOT NULL DEFAULT 'DIESEL',
      station_name     VARCHAR(200),
      invoice_number   VARCHAR(100),
      created_by       VARCHAR(100),
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fuel_records_tenant
      ON fuel_records (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_fuel_records_vehicle
      ON fuel_records (vehicle_id, fuel_date DESC);

    -- Final state: V036 (BIGSERIAL PK) + V043 ALTER (trip_id, created_at)
    CREATE TABLE IF NOT EXISTS gps_locations (
      id          BIGSERIAL    PRIMARY KEY,
      tenant_id   UUID         NOT NULL,
      vehicle_id  UUID         NOT NULL REFERENCES vehicles(id),
      lat         NUMERIC(10,7) NOT NULL,
      lng         NUMERIC(10,7) NOT NULL,
      speed_kmh   NUMERIC(5,1),
      heading     SMALLINT,
      altitude_m  NUMERIC(8,2),
      accuracy_m  NUMERIC(8,2),
      recorded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      -- V043 ALTER additions
      trip_id     VARCHAR(36),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gps_tenant_vehicle
      ON gps_locations (tenant_id, vehicle_id, recorded_at DESC);

    -- HGS geçiş kayıtları — V036 sürümü
    CREATE TABLE IF NOT EXISTS hgs_passages (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID         NOT NULL,
      vehicle_id    UUID         NOT NULL REFERENCES vehicles(id),
      hgs_tag_id    VARCHAR(50),
      passage_point VARCHAR(200),
      passage_at    TIMESTAMPTZ  NOT NULL,
      fee_kurus     BIGINT       NOT NULL DEFAULT 0,
      direction     VARCHAR(10),
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hgs_tenant
      ON hgs_passages (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_hgs_vehicle
      ON hgs_passages (vehicle_id, passage_at DESC);

    -- HGS kayıtları — V043 sürümü (VARCHAR IDs, FK yok)
    -- V036'da V017'nin oluşturduğu tablo DROP edildi; V043 yeniden oluşturur.
    CREATE TABLE IF NOT EXISTS hgs_records (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        VARCHAR(36)  NOT NULL,
      vehicle_id       VARCHAR(36)  NOT NULL,
      transaction_date TIMESTAMPTZ  NOT NULL,
      amount_kurus     BIGINT       NOT NULL,
      balance_kurus    BIGINT,
      device_type      VARCHAR(10)  NOT NULL DEFAULT 'HGS',
      device_id        VARCHAR(50),
      location         VARCHAR(300),
      direction        VARCHAR(100),
      trip_id          UUID,
      note             TEXT,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hgs_vehicle
      ON hgs_records (vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_hgs_tenant_date
      ON hgs_records (tenant_id, transaction_date DESC);

    -- ─── 13. PROJELER (V035 + V038 fix) ──────────────────────────────────────

    -- Final state: V035 + V038 (project_code rename, status Türkçe, ek sütunlar)
    CREATE TABLE IF NOT EXISTS projects (
      id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID         NOT NULL,
      project_code       VARCHAR(30)  NOT NULL,   -- V038: code → project_code
      name               VARCHAR(200) NOT NULL,
      description        TEXT,                    -- V038 addition
      status             VARCHAR(20)  NOT NULL DEFAULT 'AKTIF'
                           CHECK (status IN ('AKTIF','BEKLEMEDE','TAMAMLANDI','IPTAL')),  -- V038 güncelleme
      start_date         DATE,
      end_date           DATE,
      budget_kurus       BIGINT       NOT NULL DEFAULT 0,
      customer_id        UUID         REFERENCES crm_contacts(id),
      customer_name      VARCHAR(200),            -- V038 addition
      manager_id         UUID,
      actual_cost_kurus  BIGINT       NOT NULL DEFAULT 0,  -- V038 addition
      revenue_kurus      BIGINT       NOT NULL DEFAULT 0,  -- V038 addition
      currency           VARCHAR(3)   NOT NULL DEFAULT 'TRY',  -- V038 addition
      notes              TEXT,
      created_by         UUID,                    -- V038: VARCHAR → UUID
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, project_code)
    );
    CREATE INDEX IF NOT EXISTS idx_projects_tenant
      ON projects (tenant_id, status);

    -- Final state: V038 (DROP+CREATE)
    CREATE TABLE IF NOT EXISTS project_tasks (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id         UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_task_id     UUID,
      task_code          VARCHAR(50) NOT NULL,
      name               VARCHAR(200) NOT NULL,
      description        TEXT,
      status             VARCHAR(20) NOT NULL DEFAULT 'YAPILACAK'
                           CHECK (status IN ('YAPILACAK','DEVAM','TAMAMLANDI','IPTAL')),
      planned_start_date DATE,
      planned_end_date   DATE,
      actual_start_date  DATE,
      actual_end_date    DATE,
      planned_hours      NUMERIC(10,2) NOT NULL DEFAULT 0,
      actual_hours       NUMERIC(10,2) NOT NULL DEFAULT 0,
      assigned_to        UUID,
      sort_order         INT         NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project_v2
      ON project_tasks (project_id);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_parent
      ON project_tasks (parent_task_id);

    -- Final state: V038 (DROP+CREATE)
    CREATE TABLE IF NOT EXISTS project_costs (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id        UUID,
      cost_type      VARCHAR(20) NOT NULL,
      description    VARCHAR(300) NOT NULL,
      cost_date      DATE        NOT NULL,
      amount_kurus   BIGINT      NOT NULL,
      reference_type VARCHAR(50),
      reference_id   VARCHAR(100),
      created_by     UUID        NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_project_costs_project_v2
      ON project_costs (project_id);

    -- ─── 14. e-İRSALİYE (V041 + V046 + V049) ────────────────────────────────

    -- Final state: V041 + V046 (envelope_uuid, profile_id) + V049 (gib_status, gib_status_message, gib_document_number)
    CREATE TABLE IF NOT EXISTS waybills (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID         NOT NULL,
      waybill_number    VARCHAR(25)  NOT NULL UNIQUE,
      type              VARCHAR(20)  NOT NULL,
      status            VARCHAR(25)  NOT NULL DEFAULT 'TASLAK',
      ship_date         DATE         NOT NULL,
      delivery_date     DATE,
      sender_name       VARCHAR(250) NOT NULL,
      sender_vkn        VARCHAR(15),
      sender_address    TEXT,
      receiver_name     VARCHAR(250) NOT NULL,
      receiver_vkn_tckn VARCHAR(15),
      receiver_address  TEXT,
      vehicle_plate     VARCHAR(20),
      driver_name       VARCHAR(100),
      driver_tckn       VARCHAR(11),
      carrier_name      VARCHAR(100),
      tracking_number   VARCHAR(100),
      gib_envelope_id   UUID,                     -- V041: no FK (sadece referans)
      gib_uuid          UUID,
      gib_status_code   VARCHAR(20),
      gib_status_desc   TEXT,
      gib_sent_at       TIMESTAMPTZ,
      gib_response_at   TIMESTAMPTZ,
      signed_xml        TEXT,
      ref_type          VARCHAR(30),
      ref_id            UUID,
      ref_number        VARCHAR(30),
      return_direction  VARCHAR(20),
      notes             TEXT,
      -- V046 additions
      envelope_uuid     UUID         REFERENCES gib_envelopes(id),
      profile_id        VARCHAR(30)
                          CHECK (profile_id IN ('TEMELIRSALIYE','TICARIIRSALIYE')),
      -- V049 additions (gib_uuid, gib_status_code, gib_sent_at already in V041)
      gib_status        VARCHAR(20)
                          CHECK (gib_status IN ('PENDING','SENT','ACCEPTED','REJECTED','FAILED')),
      gib_status_message   TEXT,
      gib_document_number  VARCHAR(20),
      created_by        VARCHAR(100) NOT NULL,
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_waybills_envelope_uuid
      ON waybills (envelope_uuid) WHERE envelope_uuid IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_waybills_gib_uuid
      ON waybills (gib_uuid) WHERE gib_uuid IS NOT NULL;

    CREATE TABLE IF NOT EXISTS waybill_lines (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID         NOT NULL,
      waybill_id          UUID         NOT NULL REFERENCES waybills(id) ON DELETE CASCADE,
      product_id          UUID,
      product_name        VARCHAR(250) NOT NULL,
      sku                 VARCHAR(50),
      unit_code           VARCHAR(10)  NOT NULL DEFAULT 'ADET',
      quantity            NUMERIC(12,4) NOT NULL,
      warehouse_id        UUID,
      target_warehouse_id UUID,
      lot_number          VARCHAR(50),
      serial_number       VARCHAR(100),
      movement_id         UUID
    );

    -- GİB outbox (V041)
    CREATE TABLE IF NOT EXISTS gib_outbox (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID        NOT NULL,
      waybill_id    UUID        NOT NULL,
      action        VARCHAR(10) NOT NULL DEFAULT 'SEND',
      status        VARCHAR(15) NOT NULL DEFAULT 'PENDING',
      attempt_count INT         NOT NULL DEFAULT 0,
      last_error    TEXT,
      processed_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- GİB PUSH gelen zarflar (V052)
    CREATE TABLE IF NOT EXISTS incoming_envelopes (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id        UUID         NOT NULL,
      gib_envelope_id  VARCHAR(100) NOT NULL,
      sender_alias     VARCHAR(200) NOT NULL,
      receiver_alias   VARCHAR(200) NOT NULL,
      document_type    VARCHAR(50)  NOT NULL,
      raw_payload      TEXT,
      processed        BOOLEAN      NOT NULL DEFAULT false,
      processed_at     TIMESTAMPTZ,
      processing_error TEXT,
      last_attempt_at  TIMESTAMPTZ,
      received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (gib_envelope_id)
    );
    CREATE INDEX IF NOT EXISTS idx_incoming_envelopes_tenant_processed
      ON incoming_envelopes (tenant_id, processed) WHERE processed = false;
    CREATE INDEX IF NOT EXISTS idx_incoming_envelopes_received_at
      ON incoming_envelopes (received_at DESC);

    -- e-İrsaliye yanıt (V049)
    CREATE TABLE IF NOT EXISTS receipt_advices (
      id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           UUID         NOT NULL,
      waybill_id          UUID         NOT NULL,
      waybill_envelope_id UUID,
      response_type       VARCHAR(20)  NOT NULL
                            CHECK (response_type IN ('KABUL','KISMEN_KABUL','RED')),
      rejection_reason    TEXT,
      partial_lines       JSONB,
      status              VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT','SENT','FAILED')),
      ubl_xml             TEXT,
      error_message       TEXT,
      created_by          UUID         NOT NULL,
      created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      sent_at             TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_receipt_advices_tenant_waybill
      ON receipt_advices (tenant_id, waybill_id);

    -- ─── 15. LOJİSTİK (V042) ─────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS shipments (
      id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id               VARCHAR(36)  NOT NULL,
      order_reference         VARCHAR(100) NOT NULL,
      carrier                 VARCHAR(20)  NOT NULL,
      tracking_number         VARCHAR(100),
      carrier_shipment_id     VARCHAR(200),
      sender_name             VARCHAR(200) NOT NULL,
      sender_address          TEXT         NOT NULL,
      sender_city             VARCHAR(100) NOT NULL,
      sender_district         VARCHAR(100),
      sender_phone            VARCHAR(20)  NOT NULL,
      recipient_name          VARCHAR(200) NOT NULL,
      recipient_address       TEXT         NOT NULL,
      recipient_city          VARCHAR(100) NOT NULL,
      recipient_district      VARCHAR(100),
      recipient_phone         VARCHAR(20)  NOT NULL,
      recipient_email         VARCHAR(254),
      weight_kg               DECIMAL(8,3) NOT NULL,
      desi                    DECIMAL(8,2),
      payment_type            VARCHAR(20)  NOT NULL,
      status                  VARCHAR(30)  NOT NULL DEFAULT 'pending',
      status_description      TEXT,
      estimated_delivery_date DATE,
      delivered_at            TIMESTAMPTZ,
      last_checked_at         TIMESTAMPTZ,
      created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_shipments_tenant_status  ON shipments (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_shipments_tenant_carrier ON shipments (tenant_id, carrier);
    CREATE INDEX IF NOT EXISTS idx_shipments_tracking       ON shipments (tracking_number);
    CREATE INDEX IF NOT EXISTS idx_shipments_carrier_id     ON shipments (carrier_shipment_id);

    -- ─── 16. HAZİNE (V025 — V032 IF NOT EXISTS no-op) ────────────────────────

    CREATE TABLE IF NOT EXISTS treasury_accounts (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID        NOT NULL,
      name            VARCHAR(100) NOT NULL,
      account_type    VARCHAR(10) NOT NULL CHECK (account_type IN ('KASA','BANKA')),
      currency        VARCHAR(3)  NOT NULL DEFAULT 'TRY',
      balance_kurus   BIGINT      NOT NULL DEFAULT 0,
      bank_account_no VARCHAR(50),
      iban            VARCHAR(34),
      bank_name       VARCHAR(100),
      is_active       BOOLEAN     NOT NULL DEFAULT true,
      created_by      VARCHAR(100),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_treasury_accounts_tenant
      ON treasury_accounts (tenant_id, is_active);

    -- V025 schema (V032 aynı isimle IF NOT EXISTS dener, zaten var → no-op)
    CREATE TABLE IF NOT EXISTS treasury_transactions (
      id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id             UUID         NOT NULL,
      account_id            UUID         NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
      transaction_type      VARCHAR(20)  NOT NULL
                              CHECK (transaction_type IN (
                                'TAHSILAT','ODEME','TRANSFER','FAIZ_GELIRI',
                                'BANKA_MASRAFI','DIGER_GELIR','DIGER_GIDER'
                              )),
      amount_kurus          BIGINT       NOT NULL,
      direction             VARCHAR(3)   NOT NULL CHECK (direction IN ('IN','OUT')),
      running_balance       BIGINT       NOT NULL DEFAULT 0,
      transaction_date      DATE         NOT NULL,
      description           VARCHAR(500),
      reference_type        VARCHAR(50),
      reference_id          VARCHAR(100),
      target_account_id     UUID,
      reconciliation_status VARCHAR(15)  NOT NULL DEFAULT 'BEKLIYOR'
                              CHECK (reconciliation_status IN ('BEKLIYOR','ESLESTI','ESLESMEDI')),
      created_by            VARCHAR(100),
      created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_treasury_transactions_account_date
      ON treasury_transactions (account_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_treasury_transactions_tenant
      ON treasury_transactions (tenant_id);

    -- ─── 17. ÜRETİM (V020) ───────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS boms (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID        NOT NULL,
      product_id   UUID        NOT NULL,
      product_name VARCHAR(200) NOT NULL,
      revision_no  VARCHAR(20) NOT NULL DEFAULT '1.0',
      description  TEXT,
      is_active    BOOLEAN     NOT NULL DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_boms_tenant         ON boms (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_boms_tenant_product ON boms (tenant_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_boms_tenant_active  ON boms (tenant_id, is_active);

    CREATE TABLE IF NOT EXISTS bom_lines (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      bom_id          UUID         NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
      material_id     UUID         NOT NULL,
      material_name   VARCHAR(200) NOT NULL,
      sku             VARCHAR(100),
      quantity        NUMERIC(12,3) NOT NULL,
      scrap_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,
      warehouse_id    UUID,
      unit_of_measure VARCHAR(20)  NOT NULL DEFAULT 'ADET'
    );
    CREATE INDEX IF NOT EXISTS idx_bom_lines_bom ON bom_lines (bom_id);

    CREATE TABLE IF NOT EXISTS work_orders (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id          UUID        NOT NULL,
      wo_number          VARCHAR(20) NOT NULL UNIQUE,
      bom_id             UUID        NOT NULL,
      product_id         UUID        NOT NULL,
      product_name       VARCHAR(200) NOT NULL,
      target_quantity    NUMERIC(12,3) NOT NULL,
      produced_quantity  NUMERIC(12,3) NOT NULL DEFAULT 0,
      status             VARCHAR(20) NOT NULL DEFAULT 'TASLAK',
      planned_start_date DATE        NOT NULL,
      planned_end_date   DATE        NOT NULL,
      actual_start_date  DATE,
      actual_end_date    DATE,
      warehouse_id       UUID,
      notes              TEXT,
      created_by         UUID        NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_work_orders_tenant
      ON work_orders (tenant_id);
    CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_status
      ON work_orders (tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_bom
      ON work_orders (tenant_id, bom_id);

    CREATE TABLE IF NOT EXISTS work_order_operations (
      id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      work_order_id            UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      sequence                 INT         NOT NULL,
      operation_name           VARCHAR(200) NOT NULL,
      work_center              VARCHAR(100),
      planned_duration_minutes INT         NOT NULL,
      actual_duration_minutes  INT,
      status                   VARCHAR(20) NOT NULL DEFAULT 'BEKLIYOR',
      completed_at             TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_wo_operations_work_order
      ON work_order_operations (work_order_id);

    -- ─── 18. SEQUENCE'LER VE FONKSİYONLAR ───────────────────────────────────

    CREATE SEQUENCE IF NOT EXISTS wo_seq_2026 START 1;

    -- Sefer numarası üreteci (V037)
    CREATE OR REPLACE FUNCTION get_next_trip_seq(p_year INT)
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_seq_name TEXT;
      v_next     BIGINT;
    BEGIN
      v_seq_name := 'sf_seq_' || p_year;
      IF NOT EXISTS (
        SELECT 1 FROM pg_sequences
        WHERE schemaname = current_schema() AND sequencename = v_seq_name
      ) THEN
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1', v_seq_name);
      END IF;
      EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;
      RETURN LPAD(v_next::TEXT, 4, '0');
    END;
    $$;
  `,
};
