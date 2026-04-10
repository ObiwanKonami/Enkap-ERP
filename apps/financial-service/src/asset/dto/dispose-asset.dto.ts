import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DisposeAssetDto {
  @ApiProperty({ example: '2026-06-01', description: 'Elden çıkarılma tarihi' })
  @IsDateString()
  disposalDate!: string;

  @ApiPropertyOptional({ example: 'Teknolojik ömrünü tamamladı, hurdaya ayrıldı', description: 'Elden çıkarılma gerekçesi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
