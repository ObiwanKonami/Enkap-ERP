import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsPositive,
  IsUUID,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFuelDto {
  @ApiProperty({ example: '2026-03-22', description: 'Yakıt alım tarihi' })
  @IsDateString()
  fuelingDate!: string;

  @ApiProperty({ example: 120.5, description: 'Alınan litre miktarı' })
  @IsNumber()
  @IsPositive()
  liters!: number;

  @ApiProperty({ example: 4750, description: 'Litre başına fiyat — kuruş (örn: 47,50 TL = 4750)' })
  @IsNumber()
  @Min(0)
  pricePerLiterKurus!: number;

  @ApiProperty({ example: 572375, description: 'Toplam tutar — kuruş (örn: 5723,75 TL = 572375)' })
  @IsNumber()
  @Min(0)
  totalKurus!: number;

  @ApiPropertyOptional({ example: 'Opet Akaryakıt - E5 Karayolu', description: 'Akaryakıt istasyonu' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  station?: string;

  @ApiPropertyOptional({ example: 180500, description: 'Yakıt alım anındaki km' })
  @IsOptional()
  @IsInt()
  @Min(0)
  kmAtFueling?: number;

  @ApiPropertyOptional({ description: 'Bağlı sefer ID\'si' })
  @IsOptional()
  @IsUUID()
  tripId?: string;
}
