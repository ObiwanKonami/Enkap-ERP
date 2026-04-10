import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { ActivityService }    from './activity.service';
import { ActivityController } from './activity.controller';

@Module({
  imports:     [TenantModule],
  controllers: [ActivityController],
  providers:   [ActivityService],
  exports:     [ActivityService],
})
export class ActivityModule {}
