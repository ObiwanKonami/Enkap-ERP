import { IsUUID, IsString, IsDateString, IsOptional, IsBoolean, IsNumber, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTerminationDto {
  @ApiProperty({ description: 'Çalışan UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'İşten çıkış tarihi (YYYY-MM-DD)' })
  @IsDateString()
  terminationDate!: string;

  @ApiProperty({ description: 'SGK işten çıkış kodu (01–34)', example: '04' })
  @IsString()
  @MaxLength(2)
  sgkTerminationCode!: string;

  @ApiPropertyOptional({ description: 'Kıdem tazminatı hak edişi var mı' })
  @IsOptional()
  @IsBoolean()
  severanceEligible?: boolean;

  @ApiPropertyOptional({ description: 'İhbar tazminatı hak edişi var mı' })
  @IsOptional()
  @IsBoolean()
  noticeEligible?: boolean;

  @ApiPropertyOptional({ description: 'Kullanılmayan yıllık izin günü' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unusedLeaveDays?: number;

  @ApiPropertyOptional({ description: 'Hesaplayan kullanıcı UUID' })
  @IsOptional()
  @IsUUID()
  calculatedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
