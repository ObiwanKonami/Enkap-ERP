import { Module } from '@nestjs/common';
import { HgsService }    from './hgs.service';
import { HgsController } from './hgs.controller';

@Module({
  controllers: [HgsController],
  providers:   [HgsService],
  exports:     [HgsService],
})
export class HgsModule {}
