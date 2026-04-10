/**
 * JWT payload ve kimlik doğrulama ile ilgili tipler.
 */
import type { TenantTier } from './tenant.types';
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
