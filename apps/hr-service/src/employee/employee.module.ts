import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Employee }           from './entities/employee.entity';
import { EmployeeController } from './employee.controller';
import { EmployeeService }    from './employee.service';
import { FleetSyncService }   from './fleet-sync.service';
import { HrEventsPublisher }  from '../events/hr-events.publisher';

@Module({
  imports:     [TypeOrmModule.forFeature([Employee]), HttpModule],
  controllers: [EmployeeController],
  providers:   [EmployeeService, FleetSyncService, HrEventsPublisher],
  exports:     [EmployeeService],
})
export class EmployeeModule {}
