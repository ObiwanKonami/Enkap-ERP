import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseOrderLineDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'Ürün UUID (stock-service)' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'Dell PowerEdge R750', description: 'Ürün adı (snapshot)' })
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional({ example: 'DELL-R750', description: 'SKU' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ example: 'C62', description: 'Birim kodu (GİB UBL-TR)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitCode?: string;

  @ApiProperty({ example: 5, description: 'Sipariş miktarı' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 15000000, description: 'Birim fiyat — kuruş' })
  @IsNumber()
  @IsPositive()
  unitPriceKurus!: number;

  @ApiProperty({ example: 20, description: 'KDV oranı: 0, 1, 10, 20', enum: [0, 1, 10, 20] })
  @IsNumber()
  @Min(0)
  @Max(20)
  kdvRate!: number;

  @ApiPropertyOptional({ example: 'b2c3d4e5-...', description: 'Teslim depo UUID' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 'c3d4e5f6-...', description: 'Tedarikçi UUID' })
  @IsUUID()
  vendorId!: string;

  @ApiProperty({ example: 'ABC Teknoloji A.Ş.', description: 'Tedarikçi adı (snapshot)' })
  @IsString()
  @MaxLength(200)
  vendorName!: string;

  @ApiProperty({ example: '2026-03-20', description: 'Sipariş tarihi' })
  @IsDateString()
  orderDate!: string;

  @ApiPropertyOptional({ example: '2026-04-05', description: 'Beklenen teslimat tarihi' })
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional({ example: 'Acil sipariş — Q2 projesi için', description: 'Notlar' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseOrderLineDto], description: 'Sipariş kalemleri' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];
}
