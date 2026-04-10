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
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalesOrderLineDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'Ürün UUID (stock-service)' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'Laptop Dell XPS 15', description: 'Ürün adı snapshot' })
  @IsString()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional({ example: 'DELL-XPS15', description: 'SKU snapshot' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ example: 'Adet', description: 'Birim kodu snapshot' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitCode?: string;

  @ApiProperty({ example: 2, description: 'Sipariş miktarı' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 8500000, description: 'Birim satış fiyatı — kuruş' })
  @IsNumber()
  @IsPositive()
  unitPriceKurus!: number;

  @ApiPropertyOptional({ example: 10, description: 'İskonto oranı (%)', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountRate?: number;

  @ApiProperty({ example: 20, description: 'KDV oranı: 0, 1, 10, 20', enum: [0, 1, 10, 20] })
  @IsNumber()
  @Min(0)
  @Max(20)
  kdvRate!: number;

  @ApiPropertyOptional({ example: 'b2c3d4e5-...', description: 'Sevkiyat deposu UUID' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class DeliveryAddressDto {
  @IsString() @MaxLength(300) addressLine!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MaxLength(10) postalCode?: string;
  @IsString() @MaxLength(50) country!: string;
}

export class CreateSalesOrderDto {
  @ApiPropertyOptional({ example: 'c3d4e5f6-...', description: 'Müşteri UUID (CRM)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ example: 'Ahmet Yılmaz / ABC Ltd.', description: 'Müşteri adı snapshot' })
  @IsString()
  @MaxLength(200)
  customerName!: string;

  @ApiPropertyOptional({ example: 'ahmet@abc.com', description: 'Müşteri e-posta (bildirim için)' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiProperty({ example: '2026-03-20', description: 'Sipariş tarihi' })
  @IsDateString()
  orderDate!: string;

  @ApiPropertyOptional({ example: '2026-03-27', description: 'Taahhüt edilen teslimat tarihi' })
  @IsOptional()
  @IsDateString()
  promisedDeliveryDate?: string;

@ApiPropertyOptional({ type: DeliveryAddressDto, description: 'Teslimat adresi' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi', default: 'TRY' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Müşteri özel talebi: beyaz ambalaj', description: 'Sipariş notları' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'TY-123456789', description: 'Marketplace sipariş referans no' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  marketplaceOrderRef?: string;

  @ApiProperty({ type: [CreateSalesOrderLineDto], description: 'Sipariş kalemleri' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderLineDto)
  lines!: CreateSalesOrderLineDto[];
}
