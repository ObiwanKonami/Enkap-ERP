import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { AuthModule }         from './auth/auth.module';
import { NotificationModule } from './notifications/notification.module';
import { OAuthModule }        from './oauth/oauth.module';
import { PlatformModule }     from './platform/platform.module';
import { MembersModule }      from './members/members.module';
import { HrEventsConsumer }   from './events/hr-events.consumer';

@Module({
  imports:   [AuthModule, NotificationModule, OAuthModule, HealthModule, PlatformModule, MembersModule],
  providers: [HrEventsConsumer],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}

