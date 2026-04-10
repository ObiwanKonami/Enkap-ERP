import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { AccountModule } from '../account/account.module';
import { EdEfterService } from './edefter.service';
import { EdEfterController } from './edefter.controller';
import { YevmiyeBuilderService } from './yevmiye/yevmiye-builder.service';
import { BuyukDefterService } from './buyukdefter/buyukdefter.service';

/**
 * e-Defter modülü.
 *
 * AccountModule'u import eder — mizan kontrolü için AccountService kullanır.
 * TenantModule global olduğundan ayrıca import gerekmez,
 * ancak açıklık için belirtildi.
 */
@Module({
  imports: [
    TenantModule,
    AccountModule, // AccountService.getMizan() mizan kontrolü için
  ],
  providers: [
    EdEfterService,
    YevmiyeBuilderService,
    BuyukDefterService,
  ],
  controllers: [EdEfterController],
  exports: [EdEfterService],
})
export class EdEfterModule {}
