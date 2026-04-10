import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { ExpenseService }    from './expense.service';
import { ExpenseController } from './expense.controller';
import { HrEventsPublisher } from '../events/hr-events.publisher';

@Module({
  imports:     [TenantModule],
  controllers: [ExpenseController],
  providers:   [ExpenseService, HrEventsPublisher],
  exports:     [ExpenseService],
})
export class ExpenseModule {}
