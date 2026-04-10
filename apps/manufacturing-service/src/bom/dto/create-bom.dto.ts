import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Reçete kalemi oluşturma DTO */
export class CreateBomLineDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'Hammadde/yarı mamul UUID (stock-service)' })
  @IsUUID()
  materialId!: string;

  @ApiProperty({ example: 'Çelik Levha 2mm', description: 'Hammadde adı' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  materialName!: string;

  @ApiPropertyOptional({ example: 'MAT-001', description: 'Stok kodu' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiProperty({ example: 2.5, description: 'Bir mamul için gereken net miktar' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Fire/atık oranı % (0-100). Varsayılan: 0',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  scrapRate?: number;

  @ApiPropertyOptional({ example: 'b2c3d4e5-...', description: 'Hammaddenin çekileceği depo UUID' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'KG', description: 'Ölçü birimi (ADET, KG, LT, MT vb.). Varsayılan: ADET' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  unitOfMeasure?: string;
}

/** Reçete oluşturma DTO */
export class CreateBomDto {
  @ApiProperty({ example: 'c3d4e5f6-...', description: 'Mamul ürün UUID (stock-service)' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'Masa Model A', description: 'Mamul ürün adı (snapshot)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName!: string;

  @ApiPropertyOptional({ example: '2.1', description: 'Revizyon numarası. Varsayılan: 1.0' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  revisionNo?: string;

  @ApiPropertyOptional({ example: 'Ahşap masa üretim reçetesi', description: 'Açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Aktif reçete mi? true ise aynı ürünün diğer reçeteleri pasife alınır.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [CreateBomLineDto], description: 'Reçete kalemleri (en az 1 adet)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomLineDto)
  lines!: CreateBomLineDto[];
}
