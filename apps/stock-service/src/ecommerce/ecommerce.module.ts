import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TenantModule } from '@enkap/database';
import { EcommerceService } from './ecommerce.service';
import { EcommerceSyncScheduler } from './ecommerce-sync.scheduler';
import { EcommerceController } from './ecommerce.controller';
import { WooCommerceClient } from './woocommerce/woocommerce.client';
import { WooCommerceSyncService } from './woocommerce/woocommerce-sync.service';
import { ShopifyClient } from './shopify/shopify.client';
import { ShopifySyncService } from './shopify/shopify-sync.service';
import { TicimaxClient } from './ticimax/ticimax.client';
import { TicimaxSyncService } from './ticimax/ticimax-sync.service';
import { IdeaSoftClient } from './ideasoft/ideasoft.client';
import { IdeaSoftSyncService } from './ideasoft/ideasoft-sync.service';
// Credential şifreleme: marketplace modülündeki servis yeniden kullanılır
import { CredentialEncryptionService } from '../marketplace/credential-encryption.service';
// Stok hareketi oluşturma için
import { MovementModule } from '../movement/movement.module';

/**
 * E-ticaret Entegrasyon Modülü.
 *
 * WooCommerce, Shopify, Ticimax ve İdeaSoft platformlarıyla iki yönlü senkronizasyon:
 *  - ERP → Platform: Ürün bilgisi ve stok miktarı senkronizasyonu
 *  - Platform → ERP: Sipariş aktarımı + stok CIKIS hareketi
 *
 * Sipariş kayıtları marketplace modülündeki entity'lerle paylaşılır
 * (aynı marketplace_orders tablosu, platform kolonu ile ayrışır).
 *
 * Bağımlılıklar:
 *  - CredentialEncryptionService: marketplace modülünden import (DRY prensip)
 *  - MovementModule: stok hareketi oluşturma
 *  - TenantModule: tenant izolasyonu (TenantDataSourceManager, TenantRoutingService)
 */
@Module({
  imports: [
    // HttpService bağımlılığı (Shopify, WooCommerce interceptor'ları için)
    HttpModule,
    // TenantDataSourceManager, TenantRoutingService ve runWithTenantContext için
    TenantModule,
    // StockMovementService erişimi için
    MovementModule,
  ],
  providers: [
    // Marketplace modülündeki şifreleme servisi paylaşılır (DRY)
    CredentialEncryptionService,

    // Platform istemcileri
    WooCommerceClient,
    ShopifyClient,
    TicimaxClient,
    IdeaSoftClient,

    // Platform sync servisleri
    WooCommerceSyncService,
    ShopifySyncService,
    TicimaxSyncService,
    IdeaSoftSyncService,

    // Ana servis ve scheduler
    EcommerceService,
    EcommerceSyncScheduler,
  ],
  controllers: [EcommerceController],
  exports: [EcommerceService],
})
export class EcommerceModule {}
