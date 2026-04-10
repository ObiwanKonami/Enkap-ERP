import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { LicenseClass, DriverStatus } from '../entities/driver.entity';

export class UpdateDriverDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: ['B', 'C', 'CE', 'D', 'DE'] })
  @IsOptional()
  @IsEnum(['B', 'C', 'CE', 'D', 'DE'])
  licenseClass?: LicenseClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  licenseExpires?: string;

  @ApiPropertyOptional({ enum: ['AKTIF', 'PASIF', 'IZINDE'] })
  @IsOptional()
  @IsEnum(['AKTIF', 'PASIF', 'IZINDE'])
  status?: DriverStatus;
}
