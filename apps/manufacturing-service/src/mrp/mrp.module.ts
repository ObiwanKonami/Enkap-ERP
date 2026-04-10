import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { MrpService }    from './mrp.service';
import { MrpController } from './mrp.controller';

@Module({
  imports:     [TenantModule],
  controllers: [MrpController],
  providers:   [MrpService],
  exports:     [MrpService],
})
export class MrpModule {}
