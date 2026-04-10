import {
  IsString,
  IsNotEmpty,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { VehicleType } from '../entities/vehicle.entity';

export class CreateVehicleDto {
  @ApiProperty({ example: '34 ABC 123', description: 'Araç plakası' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plate!: string;

  @ApiProperty({ example: 'Ford', description: 'Araç markası' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand!: string;

  @ApiProperty({ example: 'Transit', description: 'Araç modeli' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @ApiPropertyOptional({ example: 2022, description: 'Model yılı' })
  @IsOptional()
  @IsInt()
  @Min(1950)
  year?: number;

  @ApiProperty({ enum: ['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'], description: 'Araç tipi' })
  @IsEnum(['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'])
  type!: VehicleType;

  @ApiPropertyOptional({ example: 3500, description: 'Yük kapasitesi (kg)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  capacityKg?: number;

  @ApiPropertyOptional({ example: 12.5, description: 'Hacim kapasitesi (m³)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  volumeM3?: number;

  @ApiPropertyOptional({ description: 'Bağlı depo ID\'si' })
  @IsOptional()
  @IsUUID()
  assignedWarehouseId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Güncel km sayacı' })
  @IsOptional()
  @IsInt()
  @Min(0)
  currentKm?: number;

  @ApiPropertyOptional({ example: 'WF0XXXTTGXNJ12345', description: 'Şasi (VIN) numarası' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vin?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'Ruhsat son tarihi' })
  @IsOptional()
  @IsDateString()
  registrationExpires?: string;

  @ApiPropertyOptional({ example: '2025-06-30', description: 'Muayene son tarihi' })
  @IsOptional()
  @IsDateString()
  inspectionExpires?: string;

  @ApiPropertyOptional({ example: '2025-11-01', description: 'Kasko son tarihi' })
  @IsOptional()
  @IsDateString()
  insuranceExpires?: string;

  @ApiPropertyOptional({ example: '2025-11-01', description: 'Trafik sigortası son tarihi' })
  @IsOptional()
  @IsDateString()
  trafficInsuranceExpires?: string;

  @ApiPropertyOptional({ example: 'TLT-001234', description: 'GPS cihaz ID\'si' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gpsDeviceId?: string;

  @ApiPropertyOptional({ example: 'teltonika', description: 'GPS sağlayıcı' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gpsProvider?: string;
}
