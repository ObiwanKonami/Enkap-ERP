import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule, TenantContextMiddleware } from '@enkap/database';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { ContactModule }  from './contact/contact.module';
import { LeadModule }     from './lead/lead.module';
import { ActivityModule } from './activity/activity.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type:        'postgres',
        url:         (cfg.get('DATABASE_URL') as string) ?? 'postgresql://postgres:postgres@localhost:5432/enkap',
        entities:    [],
        synchronize: false,
        logging:     false,
      }),
    }),

    TypeOrmModule.forRootAsync({
      name: 'control_plane',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        name:        'control_plane',
        type:        'postgres',
        url:         (cfg.get('CONTROL_PLANE_DATABASE_URL') ?? cfg.get('DATABASE_URL') ?? 'postgresql://postgres:postgres@localhost:5432/enkap') as string,
        entities:    [],
        synchronize: false,
        logging:     false,
      }),
    }),

    TenantModule,
    ContactModule,
    LeadModule,
    ActivityModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
