import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MaintenanceService }    from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';

@Module({
  imports:     [HttpModule],
  controllers: [MaintenanceController],
  providers:   [MaintenanceService],
  exports:     [MaintenanceService],
})
export class MaintenanceModule {}
