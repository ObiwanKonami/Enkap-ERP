import {
  IsString,
  IsUUID,
  IsEnum,
  IsArray,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ExpenseCategory } from '../entities/expense-line.entity';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'YEMEK',
  'ULASIM',
  'YAKIT',
  'KONAKLAMA',
  'TEMSIL',
  'KIRTASIYE',
  'TEKNIK',
  'EGITIM',
  'DIGER',
];

/** Masraf kalemi oluşturma DTO'su */
export class CreateExpenseLineDto {
  @ApiProperty({
    example: 'YEMEK',
    description: 'Masraf kategorisi',
    enum: EXPENSE_CATEGORIES,
  })
  @IsEnum(EXPENSE_CATEGORIES)
  category!: ExpenseCategory;

  @ApiProperty({
    example: 'Müşteri toplantısı öğle yemeği — 4 kişi',
    description: 'Harcama açıklaması',
  })
  @IsString()
  @MaxLength(300)
  description!: string;

  @ApiProperty({
    example: '2026-03-15',
    description: 'Harcamanın gerçekleştiği tarih (YYYY-MM-DD)',
  })
  @IsDateString()
  expenseDate!: string;

  @ApiProperty({
    example: 85000,
    description: 'KDV dahil tutar — kuruş (örn: 850,00 ₺ = 85000)',
  })
  @IsNumber()
  @IsPositive()
  amountKurus!: number;

  @ApiPropertyOptional({
    example: 15254,
    description: 'Ayrıştırılmış KDV tutarı — kuruş (KDV iade takibi için)',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  kdvKurus?: number;

  @ApiPropertyOptional({
    example: 'https://storage.enkap.com.tr/receipts/abc123.jpg',
    description: 'Makbuz/fatura dosyası URL (object storage)',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  receiptUrl?: string;

  @ApiPropertyOptional({
    example: 'Fatura no: INV-2026-0145',
    description: 'Kalem düzeyinde notlar',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Masraf raporu oluşturma DTO'su */
export class CreateExpenseReportDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Raporu oluşturan çalışanın UUID\'si (hr-service)',
  })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    example: 'Ahmet Yılmaz',
    description: 'Çalışan adı soyadı (anlık görüntü)',
  })
  @IsString()
  @MaxLength(200)
  employeeName!: string;

  @ApiProperty({
    example: '2026-03',
    description: 'Masraf dönemi (YYYY-MM formatında)',
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period YYYY-MM formatında olmalıdır (örn: 2026-03)',
  })
  period!: string;

  @ApiPropertyOptional({
    example: 'TRY',
    description: 'Para birimi kodu (ISO 4217)',
    default: 'TRY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    example: 'Mart ayı seyahat ve temsil giderleri',
    description: 'Rapor düzeyinde genel notlar',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    type: [CreateExpenseLineDto],
    description: 'Masraf kalemleri (en az 1 kalem zorunludur)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'En az bir masraf kalemi girilmelidir.' })
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseLineDto)
  lines!: CreateExpenseLineDto[];
}
