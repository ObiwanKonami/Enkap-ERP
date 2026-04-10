import { Module } from '@nestjs/common';
import { AdvanceService } from './advance.service';
import { AdvanceController } from './advance.controller';
import { HrEventsPublisher } from '../events/hr-events.publisher';

@Module({
  controllers: [AdvanceController],
  providers: [AdvanceService, HrEventsPublisher],
  exports: [AdvanceService],
})
export class AdvanceModule {}
