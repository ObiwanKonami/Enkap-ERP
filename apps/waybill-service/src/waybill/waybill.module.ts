import { Module } from '@nestjs/common';
import { ReportingModule, WaybillTemplate } from '@enkap/reporting';
import { WaybillService }    from './waybill.service';
import { WaybillController } from './waybill.controller';
import { WaybillPdfService } from './waybill-pdf.service';
import { WaybillXmlService } from './waybill-xml.service';
import { WaybillGibService } from './waybill-gib.service';
import { OutboxService }     from '../outbox/outbox.service';

@Module({
  imports:     [ReportingModule],
  controllers: [WaybillController],
  providers:   [
    WaybillService,
    WaybillPdfService,
    WaybillXmlService,
    WaybillGibService,
    WaybillTemplate,
    OutboxService,
  ],
  exports: [WaybillService, WaybillGibService, WaybillXmlService, OutboxService],
})
export class WaybillModule {}
