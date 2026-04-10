import { Module } from '@nestjs/common';
import { TerminationService } from './termination.service';
import { TerminationController } from './termination.controller';
import { HrEventsPublisher } from '../events/hr-events.publisher';

@Module({
  controllers: [TerminationController],
  providers: [TerminationService, HrEventsPublisher],
  exports: [TerminationService],
})
export class TerminationModule {}
