import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';

/** İzin verilen scope'lar */
export const VALID_SCOPES = [
  'invoices:read',
  'invoices:write',
  'stock:read',
  'stock:write',
  'financial:read',
  'hr:read',
  'crm:read',
  'crm:write',
  'analytics:read',
] as const;

export type ApiScope = (typeof VALID_SCOPES)[number];

/** API token geçerlilik süresi: 24 saat (M2M için daha uzun) */
const API_TOKEN_TTL_SECONDS = 60 * 60 * 24;

export interface CreateApiClientRequest {
  tenantId: string;
  name:     string;
  scopes:   string[];
}

export interface ApiClientRow {
  id:           string;
  tenant_id:    string;
  name:         string;
  client_id:    string;
  scopes:       string[];
  status:       'active' | 'revoked';
  last_used_at: string | null;
  created_at:   string;
}

export interface CreateApiClientResult {
  clientId:     string;
  clientSecret: string; // Yalnızca oluşturma anında döner — sonra erişilemez
  name:         string;
  scopes:       string[];
  createdAt:    string;
}

export interface ApiTokenRequest {
  grantType:    string;
  clientId:     string;
  clientSecret: string;
  scope?:       string; // boşlukla ayrılmış scope listesi (opsiyonel)
}

export interface ApiTokenResult {
  access_token: string;
  token_type:   'Bearer';
  expires_in:   number;
  scope:        string;
}

/**
 * OAuth2 client credentials akışı servisi.
 *
 * Tenant kullanıcıları API istemcisi oluşturur (insan kullanıcı JWT ile).
 * Otomasyon/entegrasyon araçları client_id + client_secret ile token alır.
 *
 * Güvenlik notları:
 *  - client_secret tek seferlik gösterilir — hash'i saklanır, düz metni asla
 *  - Token'da tenant_id bulunur → TenantGuard downstream doğrular
 *  - scope doğrulaması token issuance anında yapılır
 *  - last_used_at her token alımında güncellenir (audit)
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly db: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Yeni API istemcisi oluştur.
   * client_secret yalnızca bu yanıtta gösterilir — hash'lenerek kaydedilir.
   */
  async createApiClient(req: CreateApiClientRequest): Promise<CreateApiClientResult> {
    // Scope doğrulama
    const invalidScopes = req.scopes.filter(
      (s) => !(VALID_SCOPES as readonly string[]).includes(s),
    );
    if (invalidScopes.length > 0) {
      throw new BadRequestException(
        `Geçersiz scope'lar: ${invalidScopes.join(', ')}. ` +
        `İzin verilenler: ${VALID_SCOPES.join(', ')}`,
      );
    }

    // Mevcut aktif istemci sayısı kontrolü (tenant başına maks 10)
    const [{ count }] = await this.db.query<[{ count: string }]>(
      `SELECT COUNT(*) AS count
       FROM api_clients
       WHERE tenant_id = $1 AND status = 'active'`,
      [req.tenantId],
    );
    if (parseInt(count, 10) >= 10) {
      throw new ConflictException(
        'Tenant başına en fazla 10 aktif API istemcisi oluşturulabilir.',
      );
    }

    const clientId     = randomUUID();
    const rawSecret    = randomBytes(32).toString('hex'); // 256-bit
    const secretHash   = this.hashSecret(rawSecret);

    const rows = await this.db.query<ApiClientRow[]>(
      `INSERT INTO api_clients (tenant_id, name, client_id, client_secret_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, name, client_id, scopes, status, last_used_at, created_at`,
      [req.tenantId, req.name.trim(), clientId, secretHash, req.scopes],
    );

    const row = rows[0]!;

    this.logger.log(
      `API istemcisi oluşturuldu: client_id=${clientId} tenant=${req.tenantId}`,
    );

    return {
      clientId:     row.client_id,
      clientSecret: rawSecret, // Tek seferlik
      name:         row.name,
      scopes:       row.scopes,
      createdAt:    row.created_at,
    };
  }

  /** Tenant'ın API istemcilerini listele (secret dahil değil) */
  async listApiClients(tenantId: string): Promise<Omit<ApiClientRow, 'client_secret_hash'>[]> {
    return this.db.query<ApiClientRow[]>(
      `SELECT id, tenant_id, name, client_id, scopes, status, last_used_at, created_at
       FROM api_clients
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  /** API istemcisini iptal et */
  async revokeApiClient(tenantId: string, clientId: string): Promise<void> {
    const result = await this.db.query<{ rowCount: number }>(
      `UPDATE api_clients
       SET status = 'revoked', updated_at = NOW()
       WHERE client_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [clientId, tenantId],
    );

    // TypeORM raw query → result[1] = rowCount
    const affectedRows = (result as unknown as [unknown, number])[1];
    if (!affectedRows) {
      throw new NotFoundException(`API istemcisi bulunamadı: ${clientId}`);
    }

    this.logger.log(
      `API istemcisi iptal edildi: client_id=${clientId} tenant=${tenantId}`,
    );
  }

  /**
   * client_credentials grant — API token yayınla.
   *
   * İstenen scope'lar istemcinin kayıtlı scope'larının alt kümesi olmalıdır.
   * Boş scope → istemcinin tüm scope'ları verilir.
   */
  async issueToken(req: ApiTokenRequest): Promise<ApiTokenResult> {
    if (req.grantType !== 'client_credentials') {
      throw new BadRequestException(
        `Desteklenmeyen grant_type: ${req.grantType}. Sadece 'client_credentials' desteklenir.`,
      );
    }

    // İstemciyi bul
    const rows = await this.db.query<
      Array<{ client_id: string; tenant_id: string; client_secret_hash: string; scopes: string[]; status: string; tier: string }>
    >(
      `SELECT ac.client_id, ac.tenant_id, ac.client_secret_hash, ac.scopes, ac.status,
              tr.tier
       FROM api_clients ac
       JOIN tenant_routing tr ON tr.tenant_id = ac.tenant_id
       WHERE ac.client_id = $1
       LIMIT 1`,
      [req.clientId],
    );

    const client = rows[0];
    if (!client || client.status !== 'active') {
      // Zamanlama saldırısı koruması: gecikme
      await this.dummySecretCheck();
      throw new UnauthorizedException('Geçersiz client_id veya client_secret.');
    }

    // Secret doğrula
    const providedHash = this.hashSecret(req.clientSecret);
    if (providedHash !== client.client_secret_hash) {
      throw new UnauthorizedException('Geçersiz client_id veya client_secret.');
    }

    // Scope doğrula
    const requestedScopes = req.scope
      ? req.scope.split(' ').filter(Boolean)
      : client.scopes;

    const unauthorizedScopes = requestedScopes.filter(
      (s) => !client.scopes.includes(s),
    );
    if (unauthorizedScopes.length > 0) {
      throw new UnauthorizedException(
        `İstemci bu scope'lara sahip değil: ${unauthorizedScopes.join(', ')}`,
      );
    }

    // Token yayınla
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      sub:          client.client_id,
      tenant_id:    client.tenant_id,
      tenant_tier:  client.tier,
      user_roles:   [] as string[],
      session_id:   randomUUID(),
      jti,
      iss:          process.env.JWT_ISSUER ?? 'https://auth.enkap.local',
      aud:          ['erp-api'],
      iat:          now,
      kvkk_consent_version: 'api-client-v1',
      // API client özel alanları
      api_client:   true,
      scopes:       requestedScopes,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: API_TOKEN_TTL_SECONDS,
    });

    // last_used_at güncelle (hata onlamasın)
    this.db
      .query(
        `UPDATE api_clients SET last_used_at = NOW() WHERE client_id = $1`,
        [req.clientId],
      )
      .catch((err: Error) => {
        this.logger.warn(`last_used_at güncellenemedi: ${err.message}`);
      });

    this.logger.log(
      `API token yayınlandı: client_id=${client.client_id} tenant=${client.tenant_id} scopes=${requestedScopes.join(',')}`,
    );

    return {
      access_token: accessToken,
      token_type:   'Bearer',
      expires_in:   API_TOKEN_TTL_SECONDS,
      scope:        requestedScopes.join(' '),
    };
  }

  // ── Yardımcılar ────────────────────────────────────────────────────────────

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /** Zamanlama saldırısı koruması için sahte gecikme */
  private async dummySecretCheck(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 200 + Math.random() * 100));
  }
}
