import { IsUUID, IsEnum, IsInt, IsOptional, IsString, Min, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdvanceDto {
  @ApiProperty({ description: 'Çalışan UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ enum: ['MAAS_AVANSI', 'YILLIK_IZIN_AVANSI'], default: 'MAAS_AVANSI' })
  @IsOptional()
  @IsEnum(['MAAS_AVANSI', 'YILLIK_IZIN_AVANSI'])
  advanceType?: string;

  @ApiProperty({ description: 'Avans tutarı (kuruş)' })
  @IsInt()
  @Min(1)
  amountKurus!: number;

  @ApiPropertyOptional({ description: 'Talep gerekçesi' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ description: 'Talep tarihi (YYYY-MM-DD)' })
  @IsDateString()
  requestedAt!: string;
}
