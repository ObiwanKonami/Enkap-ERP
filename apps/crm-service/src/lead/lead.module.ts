import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { LeadService }    from './lead.service';
import { LeadController } from './lead.controller';

@Module({
  imports:     [TenantModule],
  controllers: [LeadController],
  providers:   [LeadService],
  exports:     [LeadService],
})
export class LeadModule {}
