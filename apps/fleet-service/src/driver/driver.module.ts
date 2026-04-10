import { Module } from '@nestjs/common';
import { DriverService }     from './driver.service';
import { DriverController }  from './driver.controller';
import { HrSyncController }  from './hr-sync.controller';

@Module({
  controllers: [DriverController, HrSyncController],
  providers:   [DriverService],
  exports:     [DriverService],
})
export class DriverModule {}
