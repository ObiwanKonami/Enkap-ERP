import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { BaBsService }    from './ba-bs.service';
import { BaBsController } from './babs.controller';

@Module({
  imports:     [TenantModule],
  providers:   [BaBsService],
  controllers: [BaBsController],
  exports:     [BaBsService],
})
export class BaBsModule {}
