import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FuelService }    from './fuel.service';
import { FuelController } from './fuel.controller';

@Module({
  imports:     [HttpModule],
  controllers: [FuelController],
  providers:   [FuelService],
  exports:     [FuelService],
})
export class FuelModule {}
