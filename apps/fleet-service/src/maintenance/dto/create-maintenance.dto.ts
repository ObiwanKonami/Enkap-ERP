import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MaintenanceType } from '../entities/maintenance-record.entity';

export class CreateMaintenanceDto {
  @ApiProperty({ enum: ['PERIYODIK', 'LASTIK', 'FREN', 'YAG', 'ARIZA', 'DIGER'], description: 'Bakım tipi' })
  @IsEnum(['PERIYODIK', 'LASTIK', 'FREN', 'YAG', 'ARIZA', 'DIGER'])
  type!: MaintenanceType;

  @ApiProperty({ example: 'Motor yağı değişimi + filtre', description: 'Bakım açıklaması' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: '2026-03-20', description: 'Servis tarihi' })
  @IsDateString()
  serviceDate!: string;

  @ApiPropertyOptional({ example: '2026-09-20', description: 'Sonraki bakım tarihi' })
  @IsOptional()
  @IsDateString()
  nextServiceDate?: string;

  @ApiPropertyOptional({ example: 185000, description: 'Sonraki bakım km\'si' })
  @IsOptional()
  @IsInt()
  @Min(0)
  nextServiceKm?: number;

  @ApiPropertyOptional({ example: 180250, description: 'Bakım anındaki km' })
  @IsOptional()
  @IsInt()
  @Min(0)
  kmAtService?: number;

  @ApiProperty({ example: 120000, description: 'Bakım maliyeti — kuruş' })
  @IsNumber()
  @Min(0)
  costKurus!: number;

  @ApiPropertyOptional({ example: 'Yılmaz Oto Servis' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendor?: string;

  @ApiPropertyOptional({ example: 'INV-2026-0042' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string;
}
