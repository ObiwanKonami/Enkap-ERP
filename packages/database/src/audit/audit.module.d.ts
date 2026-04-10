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
export declare class AuditModule {
}
