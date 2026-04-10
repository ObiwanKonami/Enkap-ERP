# Vault ACL Politikaları — Enkap Servisler
#
# Uygulama: vault policy write enkap-services enkap-policy.hcl
#
# Her servis için minimal yetki (least privilege prensibi):
#  - auth-service    : JWT secrets + Redis
#  - tenant-service  : DB + Vault admin (tenant per-key oluşturur)
#  - financial-service: GİB credentials + DB
#  - stock-service   : Sadece DB
#  - ml-inference    : Sadece Redis + MLflow
#
# Tenant bazında AES-256 anahtarları ayrı path'te saklanır.

# ─── Ortak — Tüm servisler ─────────────────────────────────────────────────
path "enkap/production/database" {
  capabilities = ["read"]
}

path "enkap/production/redis" {
  capabilities = ["read"]
}

path "enkap/production/rabbitmq" {
  capabilities = ["read"]
}

# ─── SMTP (auth-service + tenant-service e-posta gönderimi) ────────────────
path "enkap/production/smtp" {
  capabilities = ["read"]
}

# ─── Auth Service ───────────────────────────────────────────────────────────
path "enkap/production/jwt" {
  capabilities = ["read"]
}

# JWT key rotasyonu için oluşturma yetkisi (ayrı role'de olmalı — auth-service-admin)
path "enkap/production/jwt/rotate" {
  capabilities = ["create", "update"]
}

# ─── Tenant Service ─────────────────────────────────────────────────────────
# Yeni tenant provisioning: per-tenant AES-256 key oluşturma
path "enkap/tenants/+/encryption-key" {
  capabilities = ["create", "read", "update"]
}

# Tenant DB şifresi oluşturma
path "enkap/tenants/+/database" {
  capabilities = ["create", "read", "update"]
}

# Vault KV v2 — metadata listeleme (provizyon kontrol için)
path "enkap/tenants/+/metadata" {
  capabilities = ["read", "list"]
}

# ─── Financial Service ──────────────────────────────────────────────────────
path "enkap/production/gib" {
  capabilities = ["read"]
}

# ─── ML Service ─────────────────────────────────────────────────────────────
path "enkap/production/mlflow" {
  capabilities = ["read"]
}

# ─── Billing Service ─────────────────────────────────────────────────────────
# iyzico API kimlik bilgileri (PCI DSS kapsamında Vault'ta saklanır)
path "enkap/production/iyzico" {
  capabilities = ["read"]
}

# ─── HR Service ──────────────────────────────────────────────────────────────
# Bordro hesaplamalarında TCKN şifreleme anahtarı
path "enkap/production/hr" {
  capabilities = ["read"]
}

# ─── Marketplace Entegrasyon ─────────────────────────────────────────────────
# Trendyol/Hepsiburada API credentials (stock-service için)
path "enkap/production/marketplace/+" {
  capabilities = ["read"]
}

# ─── Firebase Admin ──────────────────────────────────────────────────────────
# FCM push bildirim service account (auth-service için)
path "enkap/production/firebase" {
  capabilities = ["read"]
}

# ─── Tenant Encryption Keys — Tüm Servisler ────────────────────────────────
# Tenant verisi şifreleme/çözme (KVKK — veri maskeleme)
path "enkap/tenants/+/encryption-key" {
  capabilities = ["read"]
}

# ─── Transit Engine — AES-256 şifreleme ─────────────────────────────────────
# Vault Transit kullanılırsa (key Vault'da kalır, sadece encrypt/decrypt API)
path "transit/encrypt/tenant-+" {
  capabilities = ["create", "update"]
}

path "transit/decrypt/tenant-+" {
  capabilities = ["create", "update"]
}

# ─── Token Kendi Kendini Yönetme ────────────────────────────────────────────
path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
