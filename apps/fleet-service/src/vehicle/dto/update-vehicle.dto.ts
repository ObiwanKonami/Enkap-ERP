import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsPositive,
  IsEnum,
  IsUUID,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { VehicleType, VehicleStatus } from '../entities/vehicle.entity';

export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: '34 ABC 123' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @ApiPropertyOptional({ example: 'Ford' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ example: 'Transit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ example: 2022 })
  @IsOptional()
  @IsInt()
  @Min(1950)
  year?: number;

  @ApiPropertyOptional({ enum: ['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'] })
  @IsOptional()
  @IsEnum(['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'])
  type?: VehicleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  capacityKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  volumeM3?: number;

  @ApiPropertyOptional({ enum: ['AKTIF', 'PASIF', 'BAKIMDA'] })
  @IsOptional()
  @IsEnum(['AKTIF', 'PASIF', 'BAKIMDA'])
  status?: VehicleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedWarehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  currentKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationExpires?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  inspectionExpires?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  insuranceExpires?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  trafficInsuranceExpires?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gpsDeviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gpsProvider?: string;
}
