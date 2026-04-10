import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsUUID,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UnitCode, CostMethod } from '../entities/product.entity';

const UNIT_CODES: UnitCode[] = ['C62', 'KGM', 'GRM', 'LTR', 'MTR', 'MTK', 'MTQ', 'BX', 'SET', 'PR', 'HUR', 'DAY', 'MON'];
const COST_METHODS: CostMethod[] = ['FIFO', 'AVG'];
const KDV_RATES = [0, 1, 10, 20];

export class CreateProductDto {
  @ApiProperty({ example: 'LAPTOP-001', description: 'Stok Kodu (SKU) — benzersiz olmalı', minLength: 1, maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  sku!: string;

  @ApiProperty({ example: 'Dell Latitude 5540', description: 'Ürün adı', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: '14" FHD, Intel Core i5-1335U', description: 'Ürün açıklaması' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Kategori UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 'C62', description: 'Birim kodu (GİB UBL standartı)', enum: ['C62', 'KGM', 'GRM', 'LTR', 'MTR', 'MTK', 'MTQ', 'BX', 'SET', 'PR', 'HUR', 'DAY', 'MON'] })
  @IsIn(UNIT_CODES, { message: `unitCode şu değerlerden biri olmalıdır: ${UNIT_CODES.join(', ')}` })
  unitCode!: UnitCode;

  @ApiPropertyOptional({ example: '8690000000001', description: 'Barkod (EAN-13, QR vb.)', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  barcode?: string;

  @ApiProperty({ example: 20, description: 'KDV oranı — 0, 1, 10 veya 20 olabilir (2023 sonrası)', enum: [0, 1, 10, 20] })
  @Type(() => Number)
  @IsNumber()
  @IsIn(KDV_RATES, { message: 'KDV oranı 0, 1, 10 veya 20 olmalıdır' })
  kdvRate!: number;

  @ApiPropertyOptional({ example: true, description: 'Ürün aktif mi? (varsayılan: true)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Stok takibi aktif mi? (varsayılan: true)' })
  @IsOptional()
  @IsBoolean()
  isStockTracked?: boolean;

  @ApiPropertyOptional({ example: 'FIFO', description: 'Maliyet yöntemi', enum: ['FIFO', 'AVG'] })
  @IsOptional()
  @IsIn(COST_METHODS)
  costMethod?: CostMethod;

  @ApiPropertyOptional({ example: 5, description: 'Yeniden sipariş noktası (adet)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ example: 2, description: 'Minimum stok miktarı — kritik stok uyarısı için' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockQty?: number;

  /** Liste satış fiyatı (kuruş) */
  @ApiPropertyOptional({ example: 4999900, description: 'Liste satış fiyatı (kuruş cinsinden — 49.999,00 ₺ = 4999900)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  listPriceKurus?: number;

  /** Ortalama birim maliyet (kuruş) — manuel düzeltme için */
  @ApiPropertyOptional({ example: 228000, description: 'Ortalama birim maliyet (kuruş) — yalnızca manuel düzeltme amaçlı' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avgUnitCostKurus?: number;
}
