import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TenantModule } from '@enkap/database';
import { WorkOrderService } from './work-order.service';
import { WorkOrderController } from './work-order.controller';

@Module({
  imports:     [TenantModule, HttpModule],
  providers:   [WorkOrderService],
  controllers: [WorkOrderController],
  exports:     [WorkOrderService],
})
export class WorkOrderModule {}
