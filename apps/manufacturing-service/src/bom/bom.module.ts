import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { BomService } from './bom.service';
import { BomController } from './bom.controller';

@Module({
  imports:     [TenantModule],
  providers:   [BomService],
  controllers: [BomController],
  exports:     [BomService],
})
export class BomModule {}
