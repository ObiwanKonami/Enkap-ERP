import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  IsObject,
  IsInt,
  Min,
  Max,
  IsEmail,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChartType, ReportDataSource } from '../entities/report-definition.entity';

/** Tek bir rapor parametresinin tanım DTO'su */
export class ReportParameterDto {
  @ApiProperty({ description: 'Parametre adı — query_template içindeki :param_name ile eşleşmeli' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Parametre veri tipi',
    enum: ['string', 'number', 'date', 'uuid'],
  })
  @IsIn(['string', 'number', 'date', 'uuid'])
  type!: 'string' | 'number' | 'date' | 'uuid';

  @ApiProperty({ description: 'Zorunlu mu?' })
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional({ description: 'Varsayılan değer (opsiyonel)' })
  @IsOptional()
  @IsString()
  default?: string;
}

/** Yeni rapor tanımı oluşturma DTO'su */
export class CreateReportDefinitionDto {
  @ApiProperty({ description: 'Rapor adı', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Rapor açıklaması', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Parameterized SQL sorgu şablonu. Yalnızca SELECT ifadesi. ' +
      'Parametre syntax: :param_name',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  query_template!: string;

  @ApiProperty({
    description: 'Parametre tanımları dizisi',
    type: [ReportParameterDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportParameterDto)
  parameters!: ReportParameterDto[];

  @ApiProperty({
    description: 'Varsayılan grafik türü',
    enum: ChartType,
  })
  @IsEnum(ChartType)
  chart_type!: ChartType;

  @ApiProperty({
    description: 'Sorgunun çalışacağı servis veritabanı',
    enum: ReportDataSource,
  })
  @IsEnum(ReportDataSource)
  data_source!: ReportDataSource;
}

/** Rapor tanımı güncelleme DTO'su — tüm alanlar opsiyonel */
export class UpdateReportDefinitionDto extends PartialType(CreateReportDefinitionDto) {}

/** Rapor çalıştırma isteği DTO'su */
export class ExecuteReportDto {
  @ApiProperty({
    description: 'Sorgu parametreleri — key: parametre adı, value: değer',
    example: { start_date: '2026-01-01', end_date: '2026-03-31' },
  })
  @IsObject()
  parameters!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Maksimum satır sayısı (1–10.000, varsayılan: 1.000)',
    minimum: 1,
    maximum: 10000,
    default: 1000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number;
}

/** Rapor zamanlama DTO'su */
export class ScheduleReportDto {
  @ApiProperty({
    description: 'Cron ifadesi — "dakika saat gün ay haftaGünü" formatı. ' +
      'Örnek: "0 9 * * 1" = Her Pazartesi 09:00 (Europe/Istanbul)',
  })
  @IsString()
  cron!: string;

  @ApiProperty({ description: 'Zamanlanmış raporun gönderileceği e-posta adresi' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Rapor çıktı formatı',
    enum: ['pdf', 'excel'],
  })
  @IsIn(['pdf', 'excel'])
  format!: 'pdf' | 'excel';
}

/**
 * Rapor paylaşım DTO'su.
 * Boş body — sunucu tarafında token üretilir.
 */
export class ShareReportDto {}
