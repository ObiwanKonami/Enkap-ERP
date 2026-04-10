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
export declare class TenantModule {
}
