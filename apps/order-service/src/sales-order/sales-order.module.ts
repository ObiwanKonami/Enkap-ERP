import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MailerModule } from '@enkap/mailer';
import { SalesOrderService }     from './sales-order.service';
import { SalesOrderController }  from './sales-order.controller';
import { WaybillEventsPublisher } from '../events/waybill-events.publisher';

@Module({
  imports:     [HttpModule, MailerModule],
  controllers: [SalesOrderController],
  providers:   [SalesOrderService, WaybillEventsPublisher],
  exports:     [SalesOrderService],
})
export class SalesOrderModule {}
