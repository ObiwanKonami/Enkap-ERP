/**
 * JWT payload ve kimlik doğrulama ile ilgili tipler.
 */

import type { TenantTier } from './tenant.types';

/** Platform (SaaS) admin rolleri — tenant rollerinden tamamen bağımsız */
export type PlatformRole = 'super_admin' | 'support' | 'billing_admin';

/** JWT access token içindeki claim yapısı */
export interface JwtPayload {
  /** Token sahibi kullanıcı UUID */
  readonly sub: string;
  /** Tenant UUID — tüm data erişim kapsamını belirler */
  readonly tenant_id: string;
  readonly tenant_tier: TenantTier;
  readonly user_roles: string[];
  readonly session_id: string;
  /** Token kimliği — revokasyon için Redis'te kontrol edilir */
  readonly jti: string;
  readonly iss: string;
  readonly aud: string[];
  readonly iat: number;
  readonly exp?: number;
  readonly kvkk_consent_version: string;
}

/**
 * Platform admin JWT access token payload'ı.
 *
 * Tenant token'larından farkları:
 *  - `tenant_id` yoktur (cross-tenant erişim var)
 *  - `platform_role` zorunludur
 *  - `aud` = 'platform-api' (tenant token'larının 'erp-api' kullandığı endpoint'lere erişemez)
 */
export interface PlatformJwtPayload {
  /** Platform admin UUID */
  readonly sub: string;
  readonly platform_role: PlatformRole;
  readonly email: string;
  readonly session_id: string;
  readonly jti: string;
  readonly iss: string;
  readonly aud: string[];
  readonly iat: number;
  readonly exp?: number;
}

export interface AuthTokenPair {
  readonly accessToken: string;
  /** HttpOnly Secure cookie olarak iletilir, response body'de olmaz */
  readonly refreshToken: string;
  readonly expiresIn: number;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly tenantSlug: string;
}

export interface RefreshTokenRequest {
  readonly refreshToken: string;
}
