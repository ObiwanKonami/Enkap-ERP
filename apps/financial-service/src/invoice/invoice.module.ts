import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@enkap/database';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { PoMatchService } from './po-match.service';
import { KdvModule } from '../kdv/kdv.module';

@Module({
  imports: [
    TenantModule,
    KdvModule,
    HttpModule.register({ timeout: 10_000 }),
    TypeOrmModule.forFeature([Invoice, InvoiceLine]),
  ],
  providers: [InvoiceService, PoMatchService],
  controllers: [InvoiceController],
  exports: [InvoiceService, PoMatchService],
})
export class InvoiceModule {}
