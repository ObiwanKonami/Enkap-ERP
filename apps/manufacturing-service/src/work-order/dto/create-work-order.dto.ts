import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** İş emri operasyonu oluşturma DTO */
export class CreateWorkOrderOperationDto {
  @ApiProperty({ example: 1, description: 'Operasyon sıra numarası' })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ example: 'Talaşlama', description: 'Operasyon adı' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  operationName!: string;

  @ApiPropertyOptional({ example: 'Torna Tezgahı 1', description: 'İş merkezi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workCenter?: string;

  @ApiProperty({ example: 60, description: 'Planlanan süre (dakika)' })
  @IsInt()
  @Min(1)
  @Max(99999)
  plannedDurationMinutes!: number;
}

/** İş emri oluşturma DTO */
export class CreateWorkOrderDto {
  @ApiProperty({ example: 'b2c3d4e5-...', description: 'Kullanılacak reçete UUID' })
  @IsUUID()
  bomId!: string;

  @ApiProperty({ example: 'c3d4e5f6-...', description: 'Mamul ürün UUID (stock-service)' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'Masa Model A', description: 'Mamul ürün adı (snapshot)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName!: string;

  @ApiProperty({ example: 100, description: 'Hedef üretim miktarı' })
  @IsNumber()
  @IsPositive()
  targetQuantity!: number;

  @ApiProperty({ example: '2026-04-01', description: 'Planlanan başlangıç tarihi' })
  @IsDateString()
  plannedStartDate!: string;

  @ApiProperty({ example: '2026-04-15', description: 'Planlanan bitiş tarihi' })
  @IsDateString()
  plannedEndDate!: string;

  @ApiPropertyOptional({ example: 'd4e5f6a7-...', description: 'Mamulün girileceği depo UUID' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Acil sipariş — öncelikli', description: 'Notlar' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    type: [CreateWorkOrderOperationDto],
    description: 'Operasyon adımları (opsiyonel)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkOrderOperationDto)
  operations?: CreateWorkOrderOperationDto[];
}
