import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { StockMovementService }    from './stock-movement.service';
import { StockMovementController } from './stock-movement.controller';
import { ProductModule }           from '../product/product.module';
import { WarehouseModule }         from '../warehouse/warehouse.module';
import { WaybillEventsPublisher }  from '../events/waybill-events.publisher';

@Module({
  imports:     [TenantModule, ProductModule, WarehouseModule],
  providers:   [StockMovementService, WaybillEventsPublisher],
  controllers: [StockMovementController],
  exports:     [StockMovementService],
})
export class MovementModule {}
