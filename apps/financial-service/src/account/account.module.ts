import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  imports: [TenantModule],
  providers: [AccountService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
