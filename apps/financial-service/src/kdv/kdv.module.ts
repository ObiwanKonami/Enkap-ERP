import { Module } from '@nestjs/common';
import { KdvEngine } from './kdv.engine';

@Module({
  providers: [KdvEngine],
  exports: [KdvEngine],
})
export class KdvModule {}
