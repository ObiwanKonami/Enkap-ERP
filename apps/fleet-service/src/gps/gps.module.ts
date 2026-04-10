import { Module } from '@nestjs/common';
import { GpsService }    from './gps.service';
import { GpsController } from './gps.controller';

@Module({
  controllers: [GpsController],
  providers:   [GpsService],
  exports:     [GpsService],
})
export class GpsModule {}
