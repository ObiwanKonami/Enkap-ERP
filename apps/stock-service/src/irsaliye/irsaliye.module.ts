import { Module } from '@nestjs/common';
import { IrsaliyeBuilderService } from './irsaliye-builder.service';

@Module({
  providers: [IrsaliyeBuilderService],
  exports: [IrsaliyeBuilderService],
})
export class IrsaliyeModule {}
