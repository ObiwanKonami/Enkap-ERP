"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantModule = exports.AUDIT_KEY = exports.AuditInterceptor = exports.Auditable = exports.AuditModule = exports.FEATURE_KEY = exports.RequiresPlan = exports.FeatureGateGuard = exports.PlatformAdminGuard = exports.ROLES_KEY = exports.Roles = exports.RolesGuard = exports.CrossTenantWriteError = exports.TenantAwareSubscriber = exports.TenantContextMiddleware = exports.TenantGuard = exports.TenantDataSourceManager = exports.TenantProvisioningError = exports.TenantSuspendedError = exports.TenantNotFoundError = exports.TenantRoutingService = exports.runWithTenantContext = exports.getTenantContext = exports.tenantContextStorage = void 0;
// Tenant context yönetimi
var tenant_context_storage_1 = require("./tenant/tenant-context.storage");
Object.defineProperty(exports, "tenantContextStorage", { enumerable: true, get: function () { return tenant_context_storage_1.tenantContextStorage; } });
Object.defineProperty(exports, "getTenantContext", { enumerable: true, get: function () { return tenant_context_storage_1.getTenantContext; } });
Object.defineProperty(exports, "runWithTenantContext", { enumerable: true, get: function () { return tenant_context_storage_1.runWithTenantContext; } });
// Routing servisi ve hataları
var tenant_routing_service_1 = require("./tenant/tenant-routing.service");
Object.defineProperty(exports, "TenantRoutingService", { enumerable: true, get: function () { return tenant_routing_service_1.TenantRoutingService; } });
Object.defineProperty(exports, "TenantNotFoundError", { enumerable: true, get: function () { return tenant_routing_service_1.TenantNotFoundError; } });
Object.defineProperty(exports, "TenantSuspendedError", { enumerable: true, get: function () { return tenant_routing_service_1.TenantSuspendedError; } });
Object.defineProperty(exports, "TenantProvisioningError", { enumerable: true, get: function () { return tenant_routing_service_1.TenantProvisioningError; } });
// Dinamik DataSource yönetimi
var tenant_datasource_manager_1 = require("./tenant/tenant-datasource.manager");
Object.defineProperty(exports, "TenantDataSourceManager", { enumerable: true, get: function () { return tenant_datasource_manager_1.TenantDataSourceManager; } });
// Guard, middleware ve subscriber
var tenant_guard_1 = require("./tenant/tenant.guard");
Object.defineProperty(exports, "TenantGuard", { enumerable: true, get: function () { return tenant_guard_1.TenantGuard; } });
var tenant_context_middleware_1 = require("./tenant/tenant-context.middleware");
Object.defineProperty(exports, "TenantContextMiddleware", { enumerable: true, get: function () { return tenant_context_middleware_1.TenantContextMiddleware; } });
var tenant_aware_subscriber_1 = require("./tenant/tenant-aware.subscriber");
Object.defineProperty(exports, "TenantAwareSubscriber", { enumerable: true, get: function () { return tenant_aware_subscriber_1.TenantAwareSubscriber; } });
Object.defineProperty(exports, "CrossTenantWriteError", { enumerable: true, get: function () { return tenant_aware_subscriber_1.CrossTenantWriteError; } });
// RBAC — rol tabanlı erişim kontrolü
var roles_guard_1 = require("./rbac/roles.guard");
Object.defineProperty(exports, "RolesGuard", { enumerable: true, get: function () { return roles_guard_1.RolesGuard; } });
var roles_decorator_1 = require("./rbac/roles.decorator");
Object.defineProperty(exports, "Roles", { enumerable: true, get: function () { return roles_decorator_1.Roles; } });
Object.defineProperty(exports, "ROLES_KEY", { enumerable: true, get: function () { return roles_decorator_1.ROLES_KEY; } });
var platform_admin_guard_1 = require("./rbac/platform-admin.guard");
Object.defineProperty(exports, "PlatformAdminGuard", { enumerable: true, get: function () { return platform_admin_guard_1.PlatformAdminGuard; } });
// Feature Gate — plan bazlı özellik kısıtlaması
var feature_gate_guard_1 = require("./rbac/feature-gate.guard");
Object.defineProperty(exports, "FeatureGateGuard", { enumerable: true, get: function () { return feature_gate_guard_1.FeatureGateGuard; } });
var feature_gate_decorator_1 = require("./rbac/feature-gate.decorator");
Object.defineProperty(exports, "RequiresPlan", { enumerable: true, get: function () { return feature_gate_decorator_1.RequiresPlan; } });
Object.defineProperty(exports, "FEATURE_KEY", { enumerable: true, get: function () { return feature_gate_decorator_1.FEATURE_KEY; } });
// KVKK Denetim İzi
var audit_module_1 = require("./audit/audit.module");
Object.defineProperty(exports, "AuditModule", { enumerable: true, get: function () { return audit_module_1.AuditModule; } });
var audit_interceptor_1 = require("./audit/audit.interceptor");
Object.defineProperty(exports, "Auditable", { enumerable: true, get: function () { return audit_interceptor_1.Auditable; } });
Object.defineProperty(exports, "AuditInterceptor", { enumerable: true, get: function () { return audit_interceptor_1.AuditInterceptor; } });
Object.defineProperty(exports, "AUDIT_KEY", { enumerable: true, get: function () { return audit_interceptor_1.AUDIT_KEY; } });
// NestJS modülü
var tenant_module_1 = require("./tenant/tenant.module");
Object.defineProperty(exports, "TenantModule", { enumerable: true, get: function () { return tenant_module_1.TenantModule; } });
