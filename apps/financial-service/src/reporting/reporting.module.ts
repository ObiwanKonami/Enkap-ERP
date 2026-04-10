import { Module } from '@nestjs/common';
import { ReportingModule as PkgReportingModule } from '@enkap/reporting';
import { ReportingController } from './reporting.controller';
import { InvoiceModule } from '../invoice/invoice.module';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [
    PkgReportingModule,
    InvoiceModule,
    AccountModule,
  ],
  controllers: [ReportingController],
})
export class ReportingModule {}
