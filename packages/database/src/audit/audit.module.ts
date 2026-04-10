import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { TenantDataSourceManager } from '../tenant/tenant-datasource.manager';

/**
 * KVKK Denetim İzi Modülü.
 *
 * AppModule'e import edildiğinde AuditInterceptor tüm
 * @Auditable() dekoratörlü endpoint'leri otomatik yakalar.
 *
 * @Global() — bir kez import yeterli.
 *
 * Kullanım (AppModule'de):
 *   @Module({ imports: [AuditModule] })
 *
 * Controller'da:
 *   @Get(':id')
 *   @Auditable({ action: 'READ', resource: 'employee.tckn' })
 *   findOne(...) {}
 */
@Global()
@Module({
  providers: [
    TenantDataSourceManager,
    {
      provide:  APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [],
})
export class AuditModule {}
