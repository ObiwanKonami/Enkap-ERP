import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantModule } from '@enkap/database';
import { SchemaCreator } from './schema-creator';
import { MigrationRunner } from './migration-runner';
import { TenantSeeder } from './tenant-seeder';
import { ProvisioningOrchestrator } from './provisioning-orchestrator';
import { ProvisioningController } from './provisioning.controller';
import { OrphanDetectionService } from './orphan-detection.service';

@Module({
  imports: [
    TenantModule,
    ScheduleModule.forRoot(),
    // Control plane veritabanı bağlantısı
    TypeOrmModule.forRootAsync({
      name: 'control_plane',
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        schema: 'public',
        entities: [],
        autoLoadEntities: true,
        synchronize: false,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : false,
        applicationName: 'enkap_tenant_service',
      }),
    }),
  ],
  controllers: [ProvisioningController],
  providers: [
    SchemaCreator,
    MigrationRunner,
    TenantSeeder,
    ProvisioningOrchestrator,
    OrphanDetectionService,
  ],
  exports: [ProvisioningOrchestrator],
})
export class ProvisioningModule {}
