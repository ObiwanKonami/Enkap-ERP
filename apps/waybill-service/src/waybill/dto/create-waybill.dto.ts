import {
  IsString, IsEnum, IsOptional, IsUUID, IsDateString,
  IsArray, ValidateNested, IsNumber, Min, MaxLength, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ICreateWaybillLineDto, WaybillType } from '@enkap/shared-types';

export class CreateWaybillLineDto implements ICreateWaybillLineDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  productId?: string;

  @ApiProperty() @IsString() @MaxLength(250)
  productName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)
  sku?: string;

  @ApiProperty({ default: 'ADET' }) @IsString() @MaxLength(10)
  unitCode!: string;

  @ApiProperty() @IsNumber() @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  targetWarehouseId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)
  lotNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  movementId?: string;
}

export class CreateWaybillDto {
  @ApiProperty({ enum: ['SATIS', 'ALIS', 'TRANSFER', 'IADE'] })
  @IsEnum(['SATIS', 'ALIS', 'TRANSFER', 'IADE'])
  type!: WaybillType;

  @ApiProperty({ example: '2026-03-23' }) @IsDateString()
  shipDate!: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  deliveryDate?: string;

  // Gönderici
  @ApiProperty() @IsString() @MaxLength(250)
  senderName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(15)
  senderVkn?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  senderAddress?: string;

  // Alıcı
  @ApiProperty() @IsString() @MaxLength(250)
  receiverName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(15)
  receiverVknTckn?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  receiverAddress?: string;

  // Taşıma
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  vehiclePlate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  driverName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(11)
  driverTckn?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  carrierName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  trackingNumber?: string;

  // Referans
  @ApiPropertyOptional() @IsOptional()
  @IsIn(['sales_order', 'purchase_order', 'stock_transfer', 'return'])
  refType?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  refId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  refNumber?: string;

  @ApiPropertyOptional({ enum: ['MUSTERIDEN', 'TEDARIKCIYE'] })
  @IsOptional() @IsEnum(['MUSTERIDEN', 'TEDARIKCIYE'])
  returnDirection?: 'MUSTERIDEN' | 'TEDARIKCIYE';

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateWaybillLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateWaybillLineDto)
  lines!: CreateWaybillLineDto[];
}
