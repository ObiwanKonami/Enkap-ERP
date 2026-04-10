import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { LeaveService }    from './leave.service';
import { LeaveController } from './leave.controller';

@Module({
  imports:     [TenantModule],
  controllers: [LeaveController],
  providers:   [LeaveService],
  exports:     [LeaveService],
})
export class LeaveModule {}
