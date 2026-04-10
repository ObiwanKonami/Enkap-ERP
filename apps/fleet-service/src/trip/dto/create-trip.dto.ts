import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTripDto {
  @ApiProperty({ description: 'Araç ID\'si' })
  @IsUUID()
  vehicleId!: string;

  @ApiProperty({ description: 'Sürücü ID\'si' })
  @IsUUID()
  driverId!: string;

  @ApiPropertyOptional({ description: 'İlişkili satış siparişi ID\'si' })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional({ description: 'İlişkili sevkiyat ID\'si' })
  @IsOptional()
  @IsUUID()
  deliveryId?: string;

  @ApiProperty({ example: 'Ankara Depo, Sincan Organize Sanayi', description: 'Çıkış noktası' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  origin!: string;

  @ApiProperty({ example: 'İstanbul, Kadıköy Müşteri Deposu', description: 'Varış noktası' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  destination!: string;

  @ApiProperty({ example: '2026-03-22T08:00:00.000Z', description: 'Planlanan kalkış zamanı' })
  @IsDateString()
  plannedDeparture!: string;

  @ApiPropertyOptional({ example: '2026-03-22T18:00:00.000Z', description: 'Planlanan varış zamanı' })
  @IsOptional()
  @IsDateString()
  plannedArrival?: string;

  @ApiPropertyOptional({ example: 'Müşteri talebi: sabah teslimat' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Kargo ağırlığı (kg) — kapasite kontrolü için', example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cargoWeightKg?: number;

  @ApiPropertyOptional({ description: 'Kargo hacmi (m³) — hacim kontrolü için', example: 20.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cargoVolumeM3?: number;
}
