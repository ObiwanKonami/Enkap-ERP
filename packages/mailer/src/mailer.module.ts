import { Module, Global } from '@nestjs/common';
import { ConfigModule }   from '@nestjs/config';
import { MailerService }  from './mailer.service';

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
@Global()
@Module({
  imports:   [ConfigModule],
  providers: [MailerService],
  exports:   [MailerService],
})
export class MailerModule {}
