import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DeviceTypeEnum {
  HGS = 'HGS',
  OGS = 'OGS',
}

export class CreateHgsDto {
  @ApiProperty({ example: '2026-03-22T08:45:00Z', description: 'Geçiş tarihi ve saati' })
  @IsDateString()
  transactionDate!: string;

  @ApiProperty({ example: 18500, description: 'Geçiş ücreti — kuruş (örn: 185,00 TL = 18500)' })
  @IsInt()
  @Min(0)
  amountKurus!: number;

  @ApiProperty({ enum: DeviceTypeEnum, default: 'HGS', description: 'Cihaz tipi' })
  @IsEnum(DeviceTypeEnum)
  deviceType!: DeviceTypeEnum;

  @ApiPropertyOptional({ example: 'Osmangazi Köprüsü Gişe 3', description: 'Geçiş noktası' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional({ example: 'İstanbul → İzmit', description: 'Yön' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  direction?: string;

  @ApiPropertyOptional({ example: 245000, description: 'HGS bakiyesi geçiş sonrası — kuruş' })
  @IsOptional()
  @IsInt()
  @Min(0)
  balanceKurus?: number;

  @ApiPropertyOptional({ example: '00123456789', description: 'HGS/OGS cihaz numarası' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Bağlı sefer ID\'si' })
  @IsOptional()
  @IsUUID()
  tripId?: string;

  @ApiPropertyOptional({ example: 'Şoför Ahmet girişi', description: 'Ek not' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  note?: string;
}
