import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBomLineDto } from './create-bom.dto';

/** Reçete güncelleme DTO — tüm alanlar opsiyonel */
export class UpdateBomDto {
  @ApiPropertyOptional({ example: 'Masa Model A v2', description: 'Mamul ürün adı snapshot' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productName?: string;

  @ApiPropertyOptional({ example: '2.2', description: 'Revizyon numarası' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  revisionNo?: string;

  @ApiPropertyOptional({ example: 'Güncellenmiş ahşap masa reçetesi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: true, description: 'Aktif mi?' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [CreateBomLineDto],
    description: 'Reçete kalemleri — verilirse mevcut kalemler silinip yeniden eklenir',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomLineDto)
  lines?: CreateBomLineDto[];
}
