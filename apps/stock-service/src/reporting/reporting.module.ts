import { Module } from '@nestjs/common';
import { ReportingModule as PkgReportingModule } from '@enkap/reporting';
import { StockReportingController } from './reporting.controller';

@Module({
  imports: [PkgReportingModule],
  controllers: [StockReportingController],
})
export class StockReportingModule {}
