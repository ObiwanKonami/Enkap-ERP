import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantProfile } from './tenant-profile.entity';
import { TenantProfileService } from './tenant-profile.service';
import { TenantProfileController } from './tenant-profile.controller';

/**
 * TenantProfileModule, control_plane DataSource'a bağımlıdır.
 * ProvisioningModule tarafından TypeOrmModule.forRootAsync('control_plane') başlatılmış olmalı.
 * Bu nedenle AppModule'de ProvisioningModule'den SONRA import edilir.
 */
@Module({
  imports:     [TypeOrmModule.forFeature([TenantProfile], 'control_plane')],
  controllers: [TenantProfileController],
  providers:   [TenantProfileService],
  exports:     [TenantProfileService],
})
export class TenantProfileModule {}
