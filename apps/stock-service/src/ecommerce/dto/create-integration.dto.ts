import {
  IsEnum,
  IsString,
  IsUrl,
  IsObject,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EcommercePlatform } from '../entities/ecommerce-integration.entity';

/**
 * E-ticaret entegrasyon oluşturma DTO'su.
 *
 * credentials alanı platform'a göre farklı yapıdadır:
 *   WooCommerce: { consumer_key: string, consumer_secret: string }
 *   Shopify:     { access_token: string, shop_domain: string }
 *   Ticimax:     { api_key: string, site_id: string }
 *   İdeaSoft:    { api_key: string, store_hash: string }
 *
 * Servis tarafında AES-256-GCM ile şifrelenerek DB'ye yazılır.
 */
export class CreateEcommerceIntegrationDto {
  @ApiProperty({
    enum: EcommercePlatform,
    description: 'E-ticaret platformu',
    example: EcommercePlatform.WOOCOMMERCE,
  })
  @IsEnum(EcommercePlatform)
  platform!: EcommercePlatform;

  @ApiProperty({
    description: 'Kullanıcı tanımlı entegrasyon adı',
    example: 'Ana Mağazam',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Mağaza kök URL\'i',
    example: 'https://magaza.com',
  })
  @IsUrl({ require_tld: false })
  store_url!: string;

  @ApiProperty({
    description: 'Platform kimlik bilgileri (platform\'a göre değişir)',
    example: { consumer_key: 'ck_xxx', consumer_secret: 'cs_xxx' },
  })
  @IsObject()
  credentials!: Record<string, string>;

  @ApiPropertyOptional({ description: 'Ürün bilgilerini senkronize et', default: true })
  @IsOptional()
  @IsBoolean()
  sync_products?: boolean;

  @ApiPropertyOptional({ description: 'Stok miktarını senkronize et', default: true })
  @IsOptional()
  @IsBoolean()
  sync_stock?: boolean;

  @ApiPropertyOptional({ description: 'Siparişleri içe aktar', default: true })
  @IsOptional()
  @IsBoolean()
  sync_orders?: boolean;
}

/** Güncelleme DTO'su — tüm alanlar opsiyonel */
export class UpdateEcommerceIntegrationDto extends PartialType(
  CreateEcommerceIntegrationDto,
) {}
