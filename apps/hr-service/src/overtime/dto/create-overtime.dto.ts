import { IsUUID, IsNumber, IsOptional, IsString, IsDateString, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOvertimeDto {
  @ApiProperty({ description: 'Çalışan UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'Fazla mesai tarihi (YYYY-MM-DD)' })
  @IsDateString()
  overtimeDate!: string;

  @ApiProperty({ description: 'Fazla mesai saat (max 11 — günlük yasal sınır 4857/41)', minimum: 0.5, maximum: 11 })
  @IsNumber()
  @Min(0.5)
  @Max(11)
  hours!: number;

  @ApiPropertyOptional({
    description: 'Çarpan: 1.5 (hafta içi %50 zamlı), 2.0 (tatil %100 zamlı)',
    enum: [1.5, 2.0],
    default: 1.5,
  })
  @IsOptional()
  @IsNumber()
  @IsEnum([1.5, 2.0])
  multiplier?: number;

  @ApiPropertyOptional({ description: 'Fazla mesai gerekçesi' })
  @IsOptional()
  @IsString()
  reason?: string;
}
