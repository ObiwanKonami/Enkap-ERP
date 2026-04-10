import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantModule } from '@enkap/database';
import { TrendyolClient } from './trendyol/trendyol.client';
import { TrendyolSyncService } from './trendyol/trendyol-sync.service';
import { HepsiburadaClient } from './hepsiburada/hepsiburada.client';
import { HepsiburadaSyncService } from './hepsiburada/hepsiburada-sync.service';
import { MarketplaceSyncScheduler } from './marketplace-sync.scheduler';
import { CredentialEncryptionService } from './credential-encryption.service';
import { MovementModule } from '../movement/movement.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // TenantDataSourceManager, TenantRoutingService ve runWithTenantContext için
    TenantModule,
    // StockMovementService'e erişim için
    MovementModule,
  ],
  providers: [
    CredentialEncryptionService,
    TrendyolClient,
    TrendyolSyncService,
    HepsiburadaClient,
    HepsiburadaSyncService,
    MarketplaceSyncScheduler,
  ],
  exports: [TrendyolSyncService, HepsiburadaSyncService],
})
export class MarketplaceModule {}
