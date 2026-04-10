import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { EBildirgeService } from './e-bildirge.service';
import { SgkController }   from './sgk.controller';

@Module({
  imports:     [TenantModule],
  providers:   [EBildirgeService],
  controllers: [SgkController],
  exports:     [EBildirgeService],
})
export class SgkModule {}
