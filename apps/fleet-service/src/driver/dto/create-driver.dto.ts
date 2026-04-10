import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LicenseClass } from '../entities/driver.entity';

export class CreateDriverDto {
  @ApiPropertyOptional({ description: 'HR servisindeki çalışan ID\'si' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ example: 'Mehmet', description: 'Sürücü adı' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Yılmaz', description: 'Sürücü soyadı' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: '+90 532 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ enum: ['B', 'C', 'CE', 'D', 'DE'], description: 'Ehliyet sınıfı' })
  @IsEnum(['B', 'C', 'CE', 'D', 'DE'])
  licenseClass!: LicenseClass;

  @ApiPropertyOptional({ example: 'A1234567890', description: 'Ehliyet numarası' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNumber?: string;

  @ApiPropertyOptional({ example: '2028-05-15', description: 'Ehliyet son geçerlilik tarihi' })
  @IsOptional()
  @IsDateString()
  licenseExpires?: string;
}
