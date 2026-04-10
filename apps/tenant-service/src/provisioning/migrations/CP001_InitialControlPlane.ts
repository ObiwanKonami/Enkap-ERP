import type { Migration } from '../migration-runner';

export const CP001_InitialControlPlane: Migration = {
  version: 'CP001',
  description: 'Initial control plane schema — squashed baseline (CP001–CP016)',
  checksum: 'squash-cp001-cp016-baseline-20260408',
  sql: `
-- ============================================================
-- SECTION 1: Tenant Routing (CP001)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_routing (
  tenant_id           UUID          PRIMARY KEY,
  tenant_slug         VARCHAR(63)   NOT NULL UNIQUE,
  schema_name         VARCHAR(63)   NOT NULL UNIQUE,
  cluster_id          VARCHAR(100)  NOT NULL DEFAULT 'default',
  pgbouncer_endpoint  VARCHAR(255)  NOT NULL DEFAULT 'pgbouncer:5432',
  pool_mode           VARCHAR(20)   NOT NULL DEFAULT 'transaction'
                                    CHECK (pool_mode IN ('transaction','session')),
  db_host             VARCHAR(255)  NOT NULL DEFAULT 'localhost',
  db_port             INTEGER       NOT NULL DEFAULT 5432,
  db_name             VARCHAR(63)   NOT NULL DEFAULT 'enkap_prod',
  db_user             VARCHAR(63)   NOT NULL DEFAULT 'enkap_user',
  tier                VARCHAR(20)   NOT NULL DEFAULT 'starter'
                                    CHECK (tier IN ('starter','growth','enterprise')),
  status              VARCHAR(20)   NOT NULL DEFAULT 'provisioning'
                                    CHECK (status IN ('provisioning','active','deprovisioning','failed')),
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 2: Provisioning Log (CP002)
-- ============================================================
CREATE TABLE IF NOT EXISTS provisioning_log (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  step          VARCHAR(100)  NOT NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'started'
                              CHECK (status IN ('started','completed','failed')),
  error_message TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_log_tenant
  ON provisioning_log(tenant_id, created_at DESC);

-- ============================================================
-- SECTION 3: Webhook Infrastructure (CP003)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  event_type    VARCHAR(100)  NOT NULL,
  target_url    TEXT          NOT NULL,
  secret        VARCHAR(255),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  retry_limit   INTEGER       NOT NULL DEFAULT 3,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant
  ON webhook_subscriptions(tenant_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID          NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_type      VARCHAR(100)  NOT NULL,
  payload         JSONB         NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','sent','failed','retrying')),
  attempt_count   INTEGER       NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_code   INTEGER,
  response_body   TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
  ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries(status) WHERE status IN ('pending','retrying');

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id          BIGSERIAL   PRIMARY KEY,
  tenant_id   UUID        NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  event_type  VARCHAR(100) NOT NULL,
  payload     JSONB       NOT NULL,
  published   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_unpublished
  ON webhook_outbox(published, created_at) WHERE published = FALSE;

-- ============================================================
-- SECTION 4: Billing (CP004)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_plans (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(100)  NOT NULL,
  tier              VARCHAR(20)   NOT NULL CHECK (tier IN ('starter','growth','enterprise')),
  price_monthly_kurus BIGINT      NOT NULL DEFAULT 0,
  price_yearly_kurus  BIGINT      NOT NULL DEFAULT 0,
  max_users         INTEGER       NOT NULL DEFAULT 5,
  max_invoices_pm   INTEGER       NOT NULL DEFAULT 100,
  features          JSONB         NOT NULL DEFAULT '[]',
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  plan_id         UUID          NOT NULL REFERENCES billing_plans(id),
  status          VARCHAR(20)   NOT NULL DEFAULT 'active'
                                CHECK (status IN ('trial','active','past_due','cancelled','suspended')),
  trial_ends_at   TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ NOT NULL,
  cancelled_at    TIMESTAMPTZ,
  iyzico_sub_key  VARCHAR(255),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant
  ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions(status) WHERE status IN ('active','trial','past_due');

CREATE TABLE IF NOT EXISTS payment_attempts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID          NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount_kurus    BIGINT        NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'TRY',
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','success','failed')),
  iyzico_ref      VARCHAR(255),
  failure_reason  TEXT,
  attempted_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_subscription
  ON payment_attempts(subscription_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  subscription_id UUID          REFERENCES subscriptions(id),
  amount_kurus    BIGINT        NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'TRY',
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','issued','paid','void')),
  issued_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant
  ON billing_invoices(tenant_id, created_at DESC);

-- ============================================================
-- SECTION 5: Tenant Profiles — MERGED FINAL STATE
-- CP005 base + CP011 (operational fields) + CP015 (GİB alias) + CP016 (phone unique index)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_profiles (
  tenant_id                UUID          PRIMARY KEY REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  -- CP005: Core company identity
  company_name             VARCHAR(255)  NOT NULL,
  trade_name               VARCHAR(255),
  vkn                      CHAR(10)      UNIQUE,
  tckn                     CHAR(11),
  tax_office               VARCHAR(100),
  mersis_no                VARCHAR(16),
  address                  TEXT,
  city                     VARCHAR(100),
  district                 VARCHAR(100),
  postal_code              VARCHAR(10),
  country                  VARCHAR(100)  NOT NULL DEFAULT 'Türkiye',
  phone                    VARCHAR(20),
  email                    VARCHAR(254),
  website                  VARCHAR(255),
  logo_url                 TEXT,
  -- CP011: Operational fields
  sgk_employer_no          VARCHAR(26),
  iban                     VARCHAR(34),
  invoice_prefix           VARCHAR(10)   NOT NULL DEFAULT 'ENK',
  next_invoice_seq         INTEGER       NOT NULL DEFAULT 1,
  onboarding_step          VARCHAR(30)   NOT NULL DEFAULT 'profile',
  onboarding_done          BOOLEAN       NOT NULL DEFAULT FALSE,
  default_kdv_rate         SMALLINT      NOT NULL DEFAULT 20,
  default_payment_term_days SMALLINT     NOT NULL DEFAULT 30,
  ar_reminder_days         INTEGER[]     NOT NULL DEFAULT '{-3,1,7,30}',
  default_currency         VARCHAR(3)    NOT NULL DEFAULT 'TRY',
  max_discount_rate        NUMERIC(5,2)  NOT NULL DEFAULT 100.00,
  default_min_stock_qty    NUMERIC(15,4) NOT NULL DEFAULT 0,
  -- CP015: GİB e-Belge entegrasyon bilgileri
  gib_gb_alias             VARCHAR(100),
  gib_pk_alias             VARCHAR(100),
  gib_username             VARCHAR(100),
  gib_enrolled_at          TIMESTAMPTZ,
  -- Audit
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- CP016: Unique partial index on phone (non-NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_tenant_profiles_phone
  ON tenant_profiles(phone) WHERE phone IS NOT NULL;

-- ============================================================
-- SECTION 6: Platform Settings & Fiscal Parameters (CP006)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(100)  PRIMARY KEY,
  value       TEXT          NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fiscal_params (
  id                    SERIAL        PRIMARY KEY,
  year                  SMALLINT      NOT NULL UNIQUE,
  min_wage_kurus        BIGINT        NOT NULL,
  sgk_ceiling_kurus     BIGINT        NOT NULL,
  kdv_rates             INTEGER[]     NOT NULL DEFAULT '{0,1,10,20}',
  withholding_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.0000,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed fiscal params for 2025
INSERT INTO fiscal_params (year, min_wage_kurus, sgk_ceiling_kurus)
VALUES (2025, 2210467, 16578503)
ON CONFLICT (year) DO NOTHING;

-- ============================================================
-- SECTION 7: Platform Admins (CP007)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(254)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  full_name     VARCHAR(200)  NOT NULL,
  role          VARCHAR(30)   NOT NULL DEFAULT 'admin'
                              CHECK (role IN ('super_admin','admin','support')),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 8: API Clients & White Label (CP008)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_clients (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  client_name     VARCHAR(100)  NOT NULL,
  client_id       VARCHAR(64)   NOT NULL UNIQUE,
  client_secret   VARCHAR(128)  NOT NULL,
  scopes          TEXT[]        NOT NULL DEFAULT '{}',
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_clients_tenant
  ON api_clients(tenant_id);

CREATE TABLE IF NOT EXISTS white_label_configs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL UNIQUE REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  primary_color   CHAR(7)       NOT NULL DEFAULT '#1E40AF',
  logo_url        TEXT,
  favicon_url     TEXT,
  app_name        VARCHAR(100)  NOT NULL DEFAULT 'Enkap ERP',
  support_email   VARCHAR(254),
  support_phone   VARCHAR(20),
  custom_domain   VARCHAR(255)  UNIQUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTION 9: Usage Events & Platform Metrics (CP009)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_events (
  id          BIGINT        GENERATED ALWAYS AS IDENTITY,
  tenant_id   UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  event_type  VARCHAR(100)  NOT NULL,
  quantity    INTEGER       NOT NULL DEFAULT 1,
  metadata    JSONB,
  occurred_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS usage_events_2025
  PARTITION OF usage_events
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS usage_events_2026
  PARTITION OF usage_events
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant
  ON usage_events(tenant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform_metrics (
  id              BIGSERIAL     PRIMARY KEY,
  metric_name     VARCHAR(100)  NOT NULL,
  metric_value    NUMERIC(18,4) NOT NULL,
  dimensions      JSONB,
  recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_metrics_name
  ON platform_metrics(metric_name, recorded_at DESC);

-- ============================================================
-- SECTION 10: Reports & Dashboards — MERGED FINAL STATE
-- CP010 base + CP012 (chart_type, data_source)
-- ============================================================
CREATE TABLE IF NOT EXISTS report_definitions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  name            VARCHAR(200)  NOT NULL,
  description     TEXT,
  report_type     VARCHAR(50)   NOT NULL,
  query_template  TEXT          NOT NULL,
  parameters      JSONB         NOT NULL DEFAULT '{}',
  -- CP012: added fields
  chart_type      VARCHAR(20),
  data_source     VARCHAR(20),
  is_system       BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_tenant
  ON report_definitions(tenant_id) WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dashboards (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  name        VARCHAR(200)  NOT NULL,
  layout      JSONB         NOT NULL DEFAULT '[]',
  is_default  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_tenant
  ON dashboards(tenant_id);

CREATE TABLE IF NOT EXISTS widgets (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id      UUID          NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  report_id         UUID          REFERENCES report_definitions(id) ON DELETE SET NULL,
  widget_type       VARCHAR(50)   NOT NULL,
  title             VARCHAR(200)  NOT NULL,
  config            JSONB         NOT NULL DEFAULT '{}',
  position_x        INTEGER       NOT NULL DEFAULT 0,
  position_y        INTEGER       NOT NULL DEFAULT 0,
  width             INTEGER       NOT NULL DEFAULT 4,
  height            INTEGER       NOT NULL DEFAULT 3,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widgets_dashboard
  ON widgets(dashboard_id);

-- ============================================================
-- SECTION 11: GİB Audit Logs — MERGED FINAL STATE
-- CP013 base + CP014 (document_uuid, signature_hash) + INSERT-ONLY RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS gib_audit_logs (
  id                BIGSERIAL     PRIMARY KEY,
  tenant_id         UUID          NOT NULL REFERENCES tenant_routing(tenant_id) ON DELETE CASCADE,
  action            VARCHAR(100)  NOT NULL,
  document_type     VARCHAR(50),
  document_no       VARCHAR(50),
  -- CP014: GİB document tracking fields
  document_uuid     UUID,
  signature_hash    VARCHAR(128),
  envelope_uuid     UUID,
  performed_by      UUID,
  ip_address        INET,
  request_payload   JSONB,
  response_payload  JSONB,
  status            VARCHAR(20)   NOT NULL DEFAULT 'success'
                                  CHECK (status IN ('success','failure','warning')),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gib_audit_logs_tenant
  ON gib_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gib_audit_logs_document
  ON gib_audit_logs(document_uuid) WHERE document_uuid IS NOT NULL;

-- INSERT-ONLY RLS policy (ÖEBSD SIS.5 compliance — logs are immutable)
ALTER TABLE gib_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gib_audit_insert_only ON gib_audit_logs;
CREATE POLICY gib_audit_insert_only ON gib_audit_logs
  AS RESTRICTIVE
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS gib_audit_no_delete ON gib_audit_logs;
CREATE POLICY gib_audit_no_delete ON gib_audit_logs
  AS RESTRICTIVE
  FOR DELETE
  USING (FALSE);

DROP POLICY IF EXISTS gib_audit_no_update ON gib_audit_logs;
CREATE POLICY gib_audit_no_update ON gib_audit_logs
  AS RESTRICTIVE
  FOR UPDATE
  USING (FALSE);
`,
};
