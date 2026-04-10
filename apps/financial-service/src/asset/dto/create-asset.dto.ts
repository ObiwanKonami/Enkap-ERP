import {
  IsString,
  IsUUID,
  IsEnum,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AssetCategory, DepreciationMethod } from '../entities/fixed-asset.entity';

const ASSET_CATEGORIES: AssetCategory[] = [
  'ARSA_ARAZI', 'BINA', 'MAKINE_TECHIZAT', 'TASIT', 'DEMIRBASLAR', 'BILGISAYAR', 'DIGER',
];

const DEPRECIATION_METHODS: DepreciationMethod[] = ['NORMAL', 'AZALAN_BAKIYE'];

export class CreateAssetDto {
  @ApiProperty({ example: 'Dell PowerEdge R750 Sunucu', description: 'Duran varlık adı' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'DV-2026-001', description: 'İç takip kodu' })
  @IsString()
  @MaxLength(50)
  assetCode!: string;

  @ApiProperty({
    example: 'BILGISAYAR',
    description: 'Varlık kategorisi (VUK faydalı ömür tablosuna göre)',
    enum: ['ARSA_ARAZI', 'BINA', 'MAKINE_TECHIZAT', 'TASIT', 'DEMIRBASLAR', 'BILGISAYAR', 'DIGER'],
  })
  @IsEnum(ASSET_CATEGORIES)
  category!: AssetCategory;

  @ApiPropertyOptional({
    example: 'NORMAL',
    description: 'Amortisman yöntemi: NORMAL (doğrusal) veya AZALAN_BAKIYE (VUK Mad. 315)',
    enum: ['NORMAL', 'AZALAN_BAKIYE'],
    default: 'NORMAL',
  })
  @IsOptional()
  @IsEnum(DEPRECIATION_METHODS)
  depreciationMethod?: DepreciationMethod;

  @ApiPropertyOptional({
    example: 4,
    description: 'Faydalı ömür (yıl) — boş bırakılırsa VUK tablosundan otomatik atanır',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  usefulLifeYears?: number;

  @ApiProperty({ example: '2026-01-15', description: 'Edinim tarihi (YYYY-MM-DD)' })
  @IsDateString()
  acquisitionDate!: string;

  @ApiProperty({ example: 12500000, description: 'Edinim maliyeti — kuruş (örn: 125.000,00 ₺ = 12500000)' })
  @IsNumber()
  @IsPositive()
  acquisitionCostKurus!: number;

  @ApiPropertyOptional({ example: 0, description: 'Hurda değeri — kuruş (genellikle 0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salvageValueKurus?: number;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'Bağlı fatura UUID\'si' })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional({ example: 'BT Departmanı - 2. Kat', description: 'Lokasyon/departman' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;
}
