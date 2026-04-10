import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { ContactService }    from './contact.service';
import { ContactController } from './contact.controller';

@Module({
  imports:     [TenantModule],
  controllers: [ContactController],
  providers:   [ContactService],
  exports:     [ContactService],
})
export class ContactModule {}
