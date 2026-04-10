import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantRoutingService } from './tenant-routing.service';
import { TenantDataSourceManager } from './tenant-datasource.manager';
import { TenantGuard } from './tenant.guard';
import { TenantContextMiddleware } from './tenant-context.middleware';

/**
 * @Global() dekoratörü ile işaretlenmiştir — bir kez import etmek yeterli.
 *
 * Her mikroservisin AppModule'una bir kez eklenir:
 *
 *   @Module({
 *     imports: [TenantModule],
 *     ...
 *   })
 *   export class AppModule {}
 *
 * Sonrasında constructor injection ile kullanılır:
 *
 *   constructor(
 *     private readonly tenantDataSourceManager: TenantDataSourceManager,
 *   ) {}
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        // Not: Production'da Vault'tan alınan per-tenant public key kullanılır.
        // Auth service rotate edince bu secret değişir.
        // Bu sadece local dev için — production'da JwtModule.register kullanma,
        // bunun yerine per-tenant key lookup ile özel JwtService yaz.
        secret: process.env.JWT_SECRET ?? 'CHANGE_IN_PRODUCTION',
        signOptions: { expiresIn: '1h' },
        verifyOptions: {
          algorithms: ['HS256', 'RS256'],
          issuer: process.env.JWT_ISSUER ?? 'https://auth.enkap.local',
          audience: ['erp-api'],
        },
      }),
    }),
  ],
  providers: [
    TenantRoutingService,
    TenantDataSourceManager,
    TenantGuard,
    TenantContextMiddleware,
  ],
  exports: [
    TenantRoutingService,
    TenantDataSourceManager,
    TenantGuard,
    TenantContextMiddleware,
    JwtModule,
  ],
})
export class TenantModule {}
