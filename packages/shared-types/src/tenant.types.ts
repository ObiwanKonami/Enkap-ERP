/**
 * Tenant (müşteri) ile ilgili tüm tip tanımları.
 * Tüm servisler bu tipleri kullanır — hiçbir servis kendi tenant tipini tanımlamaz.
 */

export type TenantTier = 'starter' | 'business' | 'enterprise';
export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'deprovisioning';
export type PoolMode = 'transaction' | 'session';

export interface Tenant {
  readonly id: string; // UUID v4 — değişmez
  readonly schemaName: string; // PostgreSQL şema adı
  readonly tier: TenantTier;
  status: TenantStatus;
  readonly clusterId: string;
  readonly pgbouncerEndpoint: string;
  readonly databaseName?: string; // Yalnızca enterprise tier için
  readonly createdAt: Date;
}

export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly userRoles: string[];
  readonly tier: TenantTier;
}

export interface TenantRoutingRecord {
  readonly tenantId: string;
  readonly tenantSlug?: string;
  readonly clusterId: string;
  readonly pgbouncerEndpoint: string;
  readonly databaseName: string;
  readonly schemaName: string;
  readonly poolMode: PoolMode;
  readonly tier: TenantTier;
}
