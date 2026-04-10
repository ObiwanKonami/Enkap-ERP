import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsNumber,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChartType } from '../entities/report-definition.entity';

/** Tek bir grid öğesi — konum ve boyut bilgisi */
export class GridItemDto {
  @ApiProperty({ description: 'Widget benzersiz kimliği (grid içinde)' })
  @IsString()
  i!: string;

  @ApiProperty({ description: 'Sol kolon pozisyonu (0 tabanlı)' })
  @IsNumber()
  x!: number;

  @ApiProperty({ description: 'Üst satır pozisyonu (0 tabanlı)' })
  @IsNumber()
  y!: number;

  @ApiProperty({ description: 'Genişlik (kolon sayısı)' })
  @IsNumber()
  w!: number;

  @ApiProperty({ description: 'Yükseklik (satır sayısı)' })
  @IsNumber()
  h!: number;
}

/** Yeni dashboard oluşturma DTO'su */
export class CreateDashboardDto {
  @ApiProperty({ description: 'Dashboard adı', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Dashboard açıklaması' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Responsive grid layout öğeleri — masaüstü (lg) ve tablet (md) breakpointleri',
    type: [GridItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridItemDto)
  layout!: GridItemDto[];

  @ApiPropertyOptional({
    description: 'Varsayılan dashboard mı? true ise mevcut varsayılan kaldırılır.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

/** Dashboard güncelleme DTO'su — tüm alanlar opsiyonel */
export class UpdateDashboardDto {
  @ApiPropertyOptional({ description: 'Yeni dashboard adı' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Güncellenen açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Güncellenmiş grid layout', type: [GridItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GridItemDto)
  layout?: GridItemDto[];

  @ApiPropertyOptional({ description: 'Varsayılan olarak işaretle' })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

/** Yeni widget oluşturma DTO'su */
export class CreateWidgetDto {
  @ApiProperty({ description: 'Widget başlığı', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({
    description: 'Bağlı rapor tanımı UUID\'si (opsiyonel)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  report_definition_id?: string;

  @ApiPropertyOptional({
    description: 'Grafik türü override — rapor tanımındaki chartType değerini geçersiz kılar',
    enum: ChartType,
  })
  @IsOptional()
  @IsEnum(ChartType)
  chart_type?: ChartType;

  @ApiPropertyOptional({
    description: 'Widget için varsayılan parametre değerleri',
    example: { start_date: '2026-01-01' },
  })
  @IsOptional()
  default_parameters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Otomatik yenileme aralığı (saniye, minimum 30)',
    minimum: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  refresh_interval_seconds?: number;

  @ApiProperty({ description: 'Dashboard içindeki sıralama pozisyonu (0 tabanlı)' })
  @IsInt()
  @Min(0)
  position!: number;
}
