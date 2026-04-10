import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/** İş emri tamamlama DTO */
export class CompleteWorkOrderDto {
  @ApiProperty({ example: 95, description: 'Fiilen üretilen miktar' })
  @IsNumber()
  @IsPositive()
  producedQuantity!: number;

  @ApiPropertyOptional({ example: '5 adet fire oluştu', description: 'Tamamlama notları' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
