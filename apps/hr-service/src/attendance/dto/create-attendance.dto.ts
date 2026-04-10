import { IsUUID, IsEnum, IsOptional, IsString, IsDateString, IsISO8601 } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttendanceDto {
  @ApiProperty({ description: 'Çalışan UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'Kayıt tarihi (YYYY-MM-DD)' })
  @IsDateString()
  recordDate!: string;

  @ApiPropertyOptional({ enum: ['NORMAL', 'REMOTE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY'], default: 'NORMAL' })
  @IsOptional()
  @IsEnum(['NORMAL', 'REMOTE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY'])
  attendanceType?: string;

  @ApiPropertyOptional({ description: 'Giriş saati (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  checkIn?: string;

  @ApiPropertyOptional({ description: 'Çıkış saati (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  checkOut?: string;

  @ApiPropertyOptional({ description: 'İzin talep UUID (LEAVE tipinde)' })
  @IsOptional()
  @IsUUID()
  leaveRequestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCheckInDto {
  @ApiProperty({ description: 'Çalışan UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'Giriş saati (ISO 8601)' })
  @IsISO8601()
  checkIn!: string;
}
