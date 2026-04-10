/**
 * @Global() — bir kez import etmek yeterli.
 *
 * Kullanım:
 *   @Module({ imports: [MailerModule] })
 *   export class AppModule {}
 *
 *   // herhangi bir provider'da:
 *   constructor(private readonly mailer: MailerService) {}
 */
export declare class MailerModule {
}
