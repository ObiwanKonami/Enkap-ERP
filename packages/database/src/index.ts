// Tenant context yönetimi
export {
  tenantContextStorage,
  getTenantContext,
  runWithTenantContext,
} from './tenant/tenant-context.storage';

// Routing servisi ve hataları
export {
  TenantRoutingService,
  TenantNotFoundError,
  TenantSuspendedError,
  TenantProvisioningError,
} from './tenant/tenant-routing.service';

// Dinamik DataSource yönetimi
export { TenantDataSourceManager } from './tenant/tenant-datasource.manager';

// Guard, middleware ve subscriber
export { TenantGuard } from './tenant/tenant.guard';
export { TenantContextMiddleware } from './tenant/tenant-context.middleware';
export {
  TenantAwareSubscriber,
  CrossTenantWriteError,
} from './tenant/tenant-aware.subscriber';

// RBAC — rol tabanlı erişim kontrolü
export { RolesGuard } from './rbac/roles.guard';
export { Roles, ROLES_KEY } from './rbac/roles.decorator';
export { PlatformAdminGuard } from './rbac/platform-admin.guard';

// Feature Gate — plan bazlı özellik kısıtlaması
export { FeatureGateGuard } from './rbac/feature-gate.guard';
export { RequiresPlan, FEATURE_KEY } from './rbac/feature-gate.decorator';

// KVKK Denetim İzi
export { AuditModule } from './audit/audit.module';
export { Auditable, AuditInterceptor, AUDIT_KEY } from './audit/audit.interceptor';
export type { AuditMeta } from './audit/audit.interceptor';
export type { AuditAction, AuditResource } from './audit/audit-log.entity';

// Global interceptors
export { TransformResponseInterceptor } from './interceptors/transform-response.interceptor';
export { SnakeToCamelInterceptor } from './interceptors/snake-to-camel.interceptor';

// NestJS modülü
export { TenantModule } from './tenant/tenant.module';
