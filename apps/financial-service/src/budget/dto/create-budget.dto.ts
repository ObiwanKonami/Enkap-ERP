import {
  IsString, IsInt, IsOptional, Min, Max, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBudgetDto {
  @ApiProperty({ example: 2026, description: 'Bütçe yılı' })
  @IsInt() @Min(2020) @Max(2100)
  year!: number;

  @ApiPropertyOptional({ example: 'v1', description: 'Revizyon etiketi', default: 'v1' })
  @IsOptional() @IsString() @MaxLength(20)
  version?: string;

  @ApiProperty({ example: '2026 Yılı Bütçesi' })
  @IsString() @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Yönetim kurulu onaylı bütçe' })
  @IsOptional() @IsString()
  notes?: string;
}

export class UpsertBudgetLineDto {
  @ApiProperty({ example: '600', description: 'TDHP hesap kodu' })
  @IsString() @MaxLength(20)
  accountCode!: string;

  @ApiProperty({ example: 'Yurtiçi Satışlar' })
  @IsString() @MaxLength(200)
  accountName!: string;

  @ApiPropertyOptional({ example: 100000000, description: 'Ocak — kuruş' })
  @IsOptional() @IsInt() jan?: number;
  @IsOptional() @IsInt() feb?: number;
  @IsOptional() @IsInt() mar?: number;
  @IsOptional() @IsInt() apr?: number;
  @IsOptional() @IsInt() may?: number;
  @IsOptional() @IsInt() jun?: number;
  @IsOptional() @IsInt() jul?: number;
  @IsOptional() @IsInt() aug?: number;
  @IsOptional() @IsInt() sep?: number;
  @IsOptional() @IsInt() oct?: number;
  @IsOptional() @IsInt() nov?: number;
  @IsOptional() @IsInt() dec?: number;
}
