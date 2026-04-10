import { Module }     from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TenantModule } from '@enkap/database';
import { PurchaseOrderService }    from './purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { WaybillEventsPublisher }  from '../events/waybill-events.publisher';

@Module({
  imports: [
    TenantModule,
    HttpModule,
  ],
  controllers: [PurchaseOrderController],
  providers:   [PurchaseOrderService, WaybillEventsPublisher],
  exports:     [PurchaseOrderService],
})
export class PurchaseOrderModule {}
