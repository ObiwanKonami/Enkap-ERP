# CLAUDE.md — Auth Service (:3001)

Enkap ERP platformunun **merkezi kimlik doğrulama ve yetkilendirme servisi**.
JWT token yönetimi, şifre sıfırlama, FCM push bildirimleri, OAuth2 M2M, ve HR entegrasyonunu yönetir.

---

## Servis Özeti

| Konu | Değer |
|------|-------|
| Port | :3001 |
| Framework | NestJS 10 + Fastify |
| Veritabanı | PostgreSQL 16 (control_plane + tenant şeması) |
| Cache/Session | Redis 7 (refresh token depolama) |
| Message Broker | RabbitMQ (HR events) |
| Observability | OpenTelemetry tracing, Prometheus metrics |

---

## Modüller ve Sorumlulukları

### 1. AuthModule (:3001/api/v1/auth)
**JWT token yönetimi, kimlik doğrulama, şifre yönetimi**

#### Alt Servisler
| Servis | Dosya | Açıklama |
|--------|-------|---------|
| `AuthService` | `auth/auth.service.ts` | Login, refresh token rotasyonu, logout |
| `JwtTokenFactory` | `auth/jwt-token.factory.ts` | Access + refresh token üretimi |
| `RefreshTokenStore` | `auth/refresh-token.store.ts` | Redis'te refresh token saklama/doğrulama |
| `LocalStrategy` | `auth/strategies/local.strategy.ts` | Passport — bcrypt şifre doğrulama |
| `JwtStrategy` | `auth/strategies/jwt.strategy.ts` | Passport — JWT doğrulama |
| `PasswordResetService` | `auth/password-reset.service.ts` | Şifre sıfırlama token'ı ve e-posta |
| `EmailVerificationService` | `auth/email-verification.service.ts` | E-posta doğrulama akışı |

#### API Endpoint'leri
```
POST   /api/v1/auth/login              → { email, password } → { accessToken, refreshToken, userId, tenantId, roles }
POST   /api/v1/auth/refresh            → { refreshToken } → { accessToken, refreshToken } (token rotation)
POST   /api/v1/auth/logout             → Oturum sonlandır, token'ları geçersiz kıl
POST   /api/v1/auth/forgot-password    → { email } → şifre sıfırlama linki gönder
POST   /api/v1/auth/reset-password     → { token, newPassword } → şifreyi sıfırla
GET    /api/v1/auth/verify-email       → ?token=... → e-posta doğrula
POST   /api/v1/auth/resend-verification → { email } → doğrulama e-postasını yeniden gönder
```

#### JWT Token Yapısı
```typescript
interface JwtPayload {
  jti:          string;                      // Token ID (revoke listesi için)
  sub:          string;                      // User ID
  tenant_id:    string;                      // Tenant ID
  tenant_tier:  'starter' | 'business' | 'enterprise';
  roles:        string[];                    // ['sistem_admin', 'muhasebeci', ...]
  session_id:   string;                      // Aynı session'daki tüm token'larda eşit
  kvkk_consent: string;                      // KVKK versiyon '2.1'
  iat:          number;                      // Timestamp
  exp:          number;                      // 1 saat (3600s)
  iss:          string;                      // 'https://auth.enkap.local'
  aud:          string;                      // 'erp-api'
}
```

#### Token Rotasyonu (Kritik — Tek Kullanımlık)
```
1. Client refresh endpoint'i çağırır (eski refreshToken ile)
2. RefreshTokenStore.consumeAndValidate() → Redis'ten atomik sil
3. Eski token tekrar kullanılmaya çalışılırsa → Exception (saldırı tespiti)
4. Yeni refresh token üretilir ve Redis'e yazılır
5. Aynı session_id ile yeni çift döner (session devam ediyor)
```

**Kurallar:**
- Refresh token: **7 gün** TTL (Redis)
- Access token: **1 saat** TTL
- Session durumu: `session_id` ile korunur
- Logout: Access token JTI + tüm refresh token'lar silinir
- Hesap devre dışı: `reloadUser()` kontrolünde yakalanır → UnauthorizedException

---

### 2. MembersModule (:3001/api/v1/members)
**Tenant kullanıcı yönetimi, davet, rol atama**

#### MembersService
```typescript
async list(tenantId, params?) → { items: TenantMember[], total, page, limit }
async get(tenantId, userId) → TenantMember
async invite(tenantId, { email, name, role }) → geçici şifre + davet e-postası
async deactivate(tenantId, userId) → hesapı is_active = false yap
async updateRole(tenantId, userId, role) → rolü güncelle
```

#### Rol Haritalama
```typescript
// Frontend role → DB rol adları
ADMIN    → ['sistem_admin']
MANAGER  → ['muhasebeci', 'ik_yoneticisi', 'satin_alma', 'depo_sorumlusu', 'satis_temsilcisi']
STAFF    → ['satis_temsilcisi', 'depo_sorumlusu', 'satin_alma']
READONLY → ['salt_okunur']
```

#### API Endpoint'leri
```
GET    /api/v1/members              → Tenant kullanıcılarını listele (paginated)
GET    /api/v1/members/:userId      → Kullanıcı detayı
POST   /api/v1/members/invite       → { email, name, role } → davet gönder
PATCH  /api/v1/members/:userId/role → { role: 'ADMIN' } → rol güncelle
DELETE /api/v1/members/:userId      → Hesabı deaktif et
```

#### User Status Haritalama
```typescript
ACTIVE  ← is_active=true  AND last_login_at != null
PENDING ← is_active=true  AND last_login_at = null (davetiye çekici)
INACTIVE← is_active=false (deaktif)
```

---

### 3. NotificationModule (:3001/api/v1/notifications)
**FCM push bildirimleri, cihaz token yönetimi**

#### Alt Servisler
| Servis | Dosya | Açıklama |
|--------|-------|---------|
| `FcmService` | `notifications/fcm.service.ts` | Firebase Cloud Messaging entegrasyonu |
| `NotificationService` | `notifications/notification.service.ts` | Bildirim orkestrasyon |
| `DeviceTokenRepository` | `notifications/device-token.repository.ts` | Cihaz token saklama |

#### Push Notification Payload
```typescript
interface PushNotificationPayload {
  title:       string;                          // "Fatura Hazır"
  body:        string;                          // "FTR-2026-0001 hazırlanmıştır."
  data: {
    type:      'invoice' | 'payroll' | 'shipment' | 'task';
    entityId:  string;                          // Fatura ID vb.
    actionUrl: string;                          // Mobil app deep link
    timestamp: string;                          // ISO 8601
  };
}
```

#### API Endpoint'leri
```
POST   /api/v1/notifications/register-device  → { fcmToken, deviceName, os, appVersion }
POST   /api/v1/notifications/unregister-device → { fcmToken }
GET    /api/v1/notifications/devices          → Kullanıcının tüm cihazları

# Internal (diğer servisler tarafından)
POST   /internal/notifications/send           → { tenantId, userId?, payload } → broadcast/single
```

#### FCM Token Yaşam Döngüsü
1. **Mobil cihaz** (Expo/React Native) giriş yaptıktan sonra FCM token alır
2. **Client** `POST /notifications/register-device` ile token kaydeder
3. **Server** token'ı `device_tokens` tablosunda `user_id`'ye bağlar
4. **Bildirim gönderimi** userId → tüm cihaz token'ları → FCM API
5. **Geçersiz token** (`invalid_tokens`) → temizlenir (`deactivateByFcmTokens()`)

**Kurallar:**
- FCM token kaydı: `tenant_id`, `user_id`, `is_active` sütunları zorunlu
- Maksimum cihaz: kullanıcı başına sınırsız (kaydedilen hepsi alır)
- Batch gönderimi: 500 token'a kadar (FCM API limit)
- Başarısız token'lar: otomatik silinir

---

### 4. OAuthModule (:3001/api/v1/oauth)
**OAuth2 client credentials (M2M) akışı**

#### OAuthService
```typescript
async createApiClient(tenantId, { name, scopes })
  → { clientId, clientSecret, name, scopes, createdAt }
  // clientSecret yalnızca bu yanıtta gösterilir — sonra hash'i saklanır

async getToken({ grantType, clientId, clientSecret, scope? })
  → { access_token, token_type: 'Bearer', expires_in, scope }
  // JWT → tenant_id + scope'ları içerir

async listApiClients(tenantId)
  → { id, name, scopes, status, lastUsedAt, createdAt }[]

async revokeApiClient(tenantId, clientId)
  → status = 'revoked'
```

#### İzin Verilen Scope'lar
```typescript
'invoices:read'    // Fatura oku
'invoices:write'   // Fatura oluştur/düzenle
'stock:read'       // Stok oku
'stock:write'      // Stok hareket yap
'financial:read'   // Mali rapor oku
'hr:read'          // İnsan kaynakları oku
'crm:read'         // CRM oku
'crm:write'        // CRM oluştur/düzenle
'analytics:read'   // Analitik oku
```

#### API Endpoint'leri
```
POST   /api/v1/oauth/clients              → Yeni API istemcisi oluştur
GET    /api/v1/oauth/clients              → İstemcileri listele
DELETE /api/v1/oauth/clients/:clientId    → İstemci iptal et
POST   /api/v1/oauth/token                → { grantType, clientId, clientSecret, scope? } → JWT
```

**Güvenlik Notları:**
- `client_secret`: hash'lenmiş depolanır, düz metin asla saklanmaz
- API token TTL: **24 saat** (M2M için tipik)
- `last_used_at`: Her token alımında güncellenir (audit)
- Downstream `TenantGuard`: token'daki `tenant_id` doğrular

---

### 5. PlatformModule (:3001/api/v1/platform)
**Platform yöneticisi kimlik doğrulama (control_plane DB)**

#### Alt Servisler
| Servis | Dosya | Açıklama |
|--------|-------|---------|
| `PlatformAdminService` | `platform/platform-admin.service.ts` | Yönetici login, token |
| `PlatformAdminRepository` | `platform/platform-admin.repository.ts` | control_plane users tablosu |
| `PlatformJwtStrategy` | `platform/platform-jwt.strategy.ts` | Platform JWT doğrulaması |
| `PlatformLocalStrategy` | `platform/platform-local.strategy.ts` | Platform şifre doğrulama |
| `PlatformRefreshTokenStore` | `platform/platform-refresh-token.store.ts` | Platform RT saklama |

#### API Endpoint'leri
```
POST   /api/v1/platform/admin/login       → { email, password } → platform JWT + RT
POST   /api/v1/platform/admin/refresh     → { refreshToken } → yeni JWT + RT
POST   /api/v1/platform/admin/logout      → Oturum sonlandır
GET    /api/v1/platform/admin/profile     → Yönetici profili
POST   /api/v1/platform/admin/me/avatar   → Avatar upload
```

**Kurallar:**
- Platform yöneticisi: `control_plane.users` tablosunda `role = 'platform_admin'`
- JWT yapısı: auth-service JWT'si ile aynı, ama control_plane DB'den doğrulanır
- Tenant yöneticisinden farklı: tenant yöneticisi JWT'de `tenant_id` içerir

---

### 6. HrEventsConsumer
**RabbitMQ tüketici — HR olaylarını dinler**

#### Dinlenen Olaylar
| Routing Key | Payload | Açıklama |
|-------------|---------|----------|
| `hr.employee.hired` | `{ tenantId, employeeId, sicilNo, name, surname, email, phone, department, title }` | Yeni çalışan → STAFF rolüyle hesap oluştur |
| `hr.employee.terminated` | `{ tenantId, employeeId, sicilNo, terminationDate, sgkTerminationCode, totalPayoutKurus }` | İşten çıkış → hesabı deaktif et |

#### İşlem Akışı
**Çalışan işe alındı:**
```
1. HrEventsConsumer → 'hr.employee.hired' mesajını al
2. MembersService.invite() çağır:
   - Geçici şifre oluştur (bcrypt'li)
   - users tablosuna yaz (tenant şeması)
   - Şifre sıfırlama e-postası gönder (MailerService)
3. Mesajı ACK et
```

**Çalışan işten çıkarıldı:**
```
1. HrEventsConsumer → 'hr.employee.terminated' mesajını al
2. MembersService.deactivate() çağır:
   - users.is_active = false
   - Refresh token'lar sonraki reload'da reddedilir
3. Mesajı ACK et
```

#### Idempotency (KRİTİK)
```typescript
// E-posta zaten kayıtlıysa → silinen hata tutulur, tekrar deneme yapılmaz
if ((err as Record<string, unknown>)?.status === 409) {
  this.logger.warn(`E-posta zaten mevcut (idempotent): ${p.email}`);
  return; // ← Mesaj ACK edilir, DLQ'ya gitmez
}
```

**RabbitMQ Yapılandırması:**
- Exchange: `enkap` (topic)
- Queue: `auth.hr-events`
- Routing key: `hr.employee.#`
- DLQ: `auth.hr-events.dlq`
- Message TTL: 60 saniye
- Prefetch: 1 (serial işleme)

---

## Veritabanı Şeması

### Tenant Şeması (Per-Tenant)
```
TABLE users
  id UUID PK
  email VARCHAR UNIQUE NOT NULL
  password_hash VARCHAR NOT NULL (bcrypt)
  name VARCHAR
  is_active BOOLEAN DEFAULT true
  is_email_verified BOOLEAN DEFAULT false
  last_login_at TIMESTAMP
  created_at TIMESTAMP DEFAULT now()
  updated_at TIMESTAMP DEFAULT now()
  tenant_id UUID FK → control_plane.tenants

TABLE user_roles
  id UUID PK
  user_id UUID FK → users
  role_id UUID FK → roles
  created_at TIMESTAMP

TABLE roles
  id UUID PK
  name VARCHAR UNIQUE (sistem_admin, muhasebeci, ik_yoneticisi, satin_alma, depo_sorumlusu, satis_temsilcisi, salt_okunur)
  description VARCHAR
  created_at TIMESTAMP

TABLE password_reset_tokens
  id UUID PK
  user_id UUID FK → users
  token_hash VARCHAR UNIQUE (SHA-256 hash)
  expires_at TIMESTAMP
  used_at TIMESTAMP
  created_at TIMESTAMP

TABLE email_verification_tokens
  id UUID PK
  user_id UUID FK → users
  token_hash VARCHAR UNIQUE
  expires_at TIMESTAMP
  verified_at TIMESTAMP
  created_at TIMESTAMP

TABLE device_tokens
  id UUID PK
  user_id UUID FK → users
  tenant_id UUID FK → control_plane.tenants
  fcm_token VARCHAR UNIQUE NOT NULL
  device_name VARCHAR
  os VARCHAR (iOS, Android, Web)
  app_version VARCHAR
  is_active BOOLEAN DEFAULT true
  last_used_at TIMESTAMP
  created_at TIMESTAMP
```

### Control Plane Şeması
```
TABLE users (platform admins)
  id UUID PK
  email VARCHAR UNIQUE NOT NULL
  password_hash VARCHAR NOT NULL
  name VARCHAR
  role VARCHAR (platform_admin, support, audit)
  is_active BOOLEAN DEFAULT true
  last_login_at TIMESTAMP
  created_at TIMESTAMP

TABLE oauth_clients
  id UUID PK
  tenant_id UUID FK → tenants
  name VARCHAR
  client_id VARCHAR UNIQUE (random hex)
  client_secret_hash VARCHAR (SHA-256 hash)
  scopes JSONB ['invoices:read', 'stock:write', ...]
  status VARCHAR (active, revoked)
  last_used_at TIMESTAMP
  created_at TIMESTAMP
```

**Redis Yapısı:**
```
# Refresh token depolama
enkap:auth:refresh:{hash} → { userId, tenantId, sessionId, createdAt, previousHash? }
TTL: 7 gün

# JTI revoke listesi (logout)
enkap:auth:revoked:jti:{jti} → '1'
TTL: 1 saat (access token geçerlilik süresi)
```

---

## Ortam Değişkenleri

```bash
# JWT imzalama
JWT_SECRET=your-secret-key-256-bits        # CHANGE_IN_PRODUCTION
JWT_ISSUER=https://auth.enkap.local        # Issuer claim
JWT_AUDIENCE=erp-api                       # Audience claim

# Veritabanı
DATABASE_URL=postgresql://user:pass@postgres:5432/enkap
CONTROL_PLANE_DATABASE_URL=               # Varsayılan: DATABASE_URL

# Redis
REDIS_URL=redis://redis:6379/0
REDIS_PASSWORD=                           # Gerekirse

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
RABBITMQ_EXCHANGE=enkap
RABBITMQ_DLQ=true

# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=enkap-prod
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
FIREBASE_CLIENT_EMAIL=firebase@enkap.iam.gserviceaccount.com

# E-posta
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxx...
SMTP_FROM="Enkap ERP <noreply@enkap.com.tr>"

# Frontend URL (davet + şifre sıfırlama linkleri için)
FRONTEND_URL=https://app.enkap.com.tr

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_DISABLED=false
NODE_ENV=production
LOG_LEVEL=info
```

---

## Güvenlik Kuralları

### 1. Şifre Güvenliği
- **Hashing**: bcrypt (rounds: 10+)
- **Doğrulama**: LocalStrategy → bcrypt.compare()
- **Şifre sıfırlama**: Token tabanlı (Redis TTL 15 dk)
- **E-posta bilgi sızdırması**: forgot-password sessiz 200 dön (bulunamazsa hata verme)

### 2. Token Güvenliği
- **Access token**: 1 saat TTL, JTI doğrulama (revoke listesi)
- **Refresh token**: 7 gün TTL, tek kullanımlık (atomik Redis sil)
- **Rotation**: Her refresh'te yeni çift üretilir, eski token'lar silinir
- **Saldırı tespiti**: Eski refresh token 2. kez kullanılmaya çalışılırsa hata

### 3. Tenant İzolasyonu
- `TenantGuard`: Her endpoint'te JWT → `tenant_id` doğrulanır
- UserRepository: TenantDataSourceManager → tenant DB'ye erişim
- CrossTenantWriteError: Güvenlik ihlali → StackTrace kaydedilir (KVKK)

### 4. FCM Token Güvenliği
- **Depolama**: Plain text — Firebase imzasıyla korunan
- **Revoke**: Logout → device_tokens deaktif edilmez ama mobil client'ın lider takibi varsa güncel token atılır
- **Geçersiz token temizleme**: FCM API 401 döndürürse otomat silinir

### 5. OAuth2 (M2M) Güvenliği
- **client_secret**: Hash'lenmiş (SHA-256)
- **Credential validation**: Her istek clientId + clientSecret doğrulama
- **Scope enforcement**: Token issuance anında belirlenir, downstream guard'larda doğrulanır
- **Audit**: `last_used_at` her token alımında güncellenir

---

## Hata Yönetimi

| HTTP | Hata | Açıklama |
|------|------|---------|
| 400 | `BadRequestException` | Validation hatası (DTO) |
| 401 | `UnauthorizedException` | Kimlik doğrulama başarısız (şifre, token, vs.) |
| 409 | `ConflictException` | E-posta zaten kayıtlı |
| 404 | `NotFoundException` | Kullanıcı/token bulunamadı |
| 429 | RateLimitException | Çok fazla giriş denemesi (future) |
| 500 | InternalServerErrorException | Sunucu hatası |

**Özel Hata Tipleri:**
```typescript
class TokenExpiredException extends UnauthorizedException {}
class InvalidRefreshTokenException extends UnauthorizedException {}
class AccountDisabledException extends UnauthorizedException {}
class EmailAlreadyVerifiedException extends ConflictException {}
```

---

## Kod Yazarken Uyulacak Kurallar

### 1. Tenant Context
```typescript
// ✅ Doğru — TenantGuard + getTenantContext()
@UseGuards(TenantGuard)
@Post('login')
async login(@Body() dto: LoginDto) {
  const ctx = getTenantContext();
  const ds = await this.dsManager.getDataSource(ctx.tenantId);
}

// ❌ Yanlış — parametre olarak geçmek
async login(tenantId: string) // asla böyle
```

### 2. Şifre Doğrulama
```typescript
// ✅ Doğru — bcrypt kullan
const isValid = await bcrypt.compare(plaintext, hash);

// ❌ Yanlış — timing attack'a açık
if (plaintext === hash) { }
```

### 3. Token Saklama (Mobil)
```typescript
// ✅ Doğru — Expo secure store
import { SecureStore } from 'expo-secure-store';
await SecureStore.setItemAsync('access_token', token);

// ❌ Yanlış — AsyncStorage (plain text)
AsyncStorage.setItem('access_token', token)
```

### 4. E-posta Şablonları
```typescript
// Tüm e-postalar MailerService üzerinden
await this.mailerService.sendPasswordReset(email, resetToken, frontendUrl);
```

### 5. Logger Kullanımı
```typescript
private readonly logger = new Logger(AuthService.name);

this.logger.log(`Giriş: userId=${user.id}`);          // info
this.logger.warn(`Geçersiz token: tenant=${tenantId}`); // warning
this.logger.error(`DB hatası: ${err.message}`, err.stack); // error
```

---

## Entegrasyon Noktaları

### Diğer Servislerle İletişim

**RabbitMQ (tüketici):**
- `hr.employee.hired` ← hr-service (yeni çalışan hesabı oluştur)
- `hr.employee.terminated` ← hr-service (hesabı deaktif et)

**RabbitMQ (yayın):**
- Token revoke events (future) → billing-service (dunning durumu kontrol)

**HttpService:**
- Firebase Admin SDK → FCM token doğrulama
- Tenant-service → kota kontrol (user invite limiti)

**MailerService:**
```typescript
// @enkap/mailer üzerinden — asla doğrudan nodemailer
await this.mailer.sendPasswordReset(email, token, redirectUrl);
await this.mailer.sendInvitation(email, tempPassword, tenantName);
await this.mailer.sendVerificationEmail(email, token);
```

---

## Testing

```bash
# Unit tests
pnpm --filter @enkap/auth-service test:unit

# E2E tests
pnpm --filter @enkap/auth-service test:e2e

# Load tests (k6)
pnpm --filter @enkap/auth-service test:load
```

**Test Örnekleri:**
```typescript
// Login flow
POST /api/v1/auth/login
{ "email": "user@example.com", "password": "Test@1234" }
→ 200 { accessToken, refreshToken, userId, tenantId, roles }

// Refresh token rotation
POST /api/v1/auth/refresh
{ "refreshToken": "rt_..." }
→ 200 { accessToken, refreshToken } (yeni çift)

// İkinci refresh'te eski token kabul edilmez
POST /api/v1/auth/refresh
{ "refreshToken": "rt_..." } (eski, 1. yanıttan)
→ 401 "Yenileme token'ı geçersiz..."

// Logout
POST /api/v1/auth/logout
{ "refreshToken": "rt_..." }
→ 200 (access + refresh token'ları silinir)
```

---

## Deployment

```bash
# Docker image
docker build -f infrastructure/docker/nestjs.Dockerfile -t enkap/auth-service .

# Kubernetes
kubectl apply -f infrastructure/kubernetes/services/auth-service.yaml

# Health probes
GET /health     → liveness
GET /health/ready → readiness

# Metrics (Prometheus)
GET /metrics    → prom-client formatında
```

**Startup sequence:**
1. `initTracing('auth-service')` → OpenTelemetry setup
2. NestFactory.create() → AppModule load
3. AllExceptionsFilter → global error handler
4. MetricsMiddleware → request/response metrics
5. TenantContextMiddleware → AsyncLocalStorage init
6. listen(3001) → Fastify server start

---

## Sık Sorulan Sorular

**S: Bir kullanıcı logout'tan sonra access token'ını tekrar kullanabilir mi?**
A: Hayır. Logout anında access token JTI'ı revoke listesine (Redis) eklenir. Downstream TenantGuard → JwtStrategy → revoke listesi kontrolü yapılır.

**S: Refresh token'ım 1 hafta geçerse ne olur?**
A: Automatic 401. Mobil client logout tetiklenir, yeniden giriş promptu gösterilir.

**S: Platform yöneticisi ile tenant yöneticisi farkı?**
A: Platform yöneticisi control_plane DB'de (`platform_admin` rolü), tenant yöneticisi her tenant şemasında (`sistem_admin` rolü). JWT'ler farklı DB'lerden doğrulanır.

**S: FCM cihaz token'ım geçersizse?**
A: Bildirim gönderimi başarısız olur, token otomatik `device_tokens` tablosundan silinir. Mobil client new token register etmeli.

**S: API istemcimin secret'ini kaybedersem?**
A: Secret yeniden oluşturamazsınız — yeni client oluşturmalısınız. Eski client'ı revoke ettikten sonra.

---

## İlgili Dosyalar

- **CLAUDE.md (ana proje):** `/home/obi/Desktop/enkap/CLAUDE.md` — Platform-wide kurallar
- **UI_RULES.md:** Dashboard UI standartları
- **eksik_filtreler.md:** Eklenmesi gereken backend filtreleri
