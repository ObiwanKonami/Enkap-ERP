import { IsUUID, IsString, IsOptional, IsISO8601, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssetDto {
  @ApiProperty({ description: 'Çalışan UUID' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'Zimmet adı' })
  @IsString()
  @MaxLength(255)
  assetName!: string;

  @ApiPropertyOptional({ description: 'Kategori', enum: ['BILGISAYAR', 'TELEFON', 'ARAC', 'MOBILYA', 'DIGER'] })
  @IsOptional()
  @IsString()
  assetCategory?: string;

  @ApiPropertyOptional({ description: 'Seri numarası' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Ürün UUID (stock-service referansı)' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ description: 'Zimmet tarihi (ISO 8601)' })
  @IsISO8601()
  assignedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
