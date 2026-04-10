import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { TransactionType } from '../entities/treasury-transaction.entity';

const TRANSACTION_TYPES: TransactionType[] = [
  'TAHSILAT', 'ODEME', 'TRANSFER', 'FAIZ_GELIRI', 'BANKA_MASRAFI', 'DIGER_GELIR', 'DIGER_GIDER',
];

export class CreateTransactionDto {
  @ApiProperty({
    example: 'TAHSILAT',
    enum: TRANSACTION_TYPES,
    description: 'Hareket tipi',
  })
  @IsEnum(TRANSACTION_TYPES)
  transactionType!: TransactionType;

  @ApiProperty({ example: 5000000, description: 'Tutar — kuruş (50.000,00 ₺ = 5000000)' })
  @IsNumber()
  @IsPositive()
  amountKurus!: number;

  @ApiProperty({ example: '2026-03-20', description: 'İşlem tarihi (YYYY-MM-DD)' })
  @IsDateString()
  transactionDate!: string;

  @ApiPropertyOptional({ example: 'Fatura No: FTR-2026-0045 tahsilatı', description: 'Açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'invoice', description: 'Referans belge tipi' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ example: 'FTR-2026-0045', description: 'Referans belge no veya UUID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;

  /** Sadece TRANSFER tipinde zorunlu */
  @ApiPropertyOptional({ example: 'b2c3d4e5-...', description: 'Transfer hedef hesap UUID — yalnızca TRANSFER tipinde' })
  @IsOptional()
  @IsUUID()
  targetAccountId?: string;
}
