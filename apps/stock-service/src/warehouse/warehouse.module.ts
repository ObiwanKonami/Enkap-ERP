import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { WarehouseService }    from './warehouse.service';
import { WarehouseController } from './warehouse.controller';

@Module({
  imports:     [TenantModule],
  providers:   [WarehouseService],
  controllers: [WarehouseController],
  exports:     [WarehouseService],
})
export class WarehouseModule {}
