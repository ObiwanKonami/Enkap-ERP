import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AccountType } from '../entities/treasury-account.entity';

export class CreateAccountDto {
  @ApiProperty({ example: 'İş Bankası TL Ana Hesap', description: 'Hesap adı' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'BANKA', enum: ['KASA', 'BANKA'], description: 'Hesap tipi' })
  @IsEnum(['KASA', 'BANKA'] as AccountType[])
  accountType!: AccountType;

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi (varsayılan: TRY)', default: 'TRY' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: '12345678901234', description: 'Banka hesap numarası (BANKA tipi için)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccountNo?: string;

  @ApiPropertyOptional({ example: 'TR12 0006 4000 0011 2345 6789 01', description: 'IBAN' })
  @IsOptional()
  @IsString()
  @MaxLength(34)
  iban?: string;

  @ApiPropertyOptional({ example: 'Türkiye İş Bankası', description: 'Banka adı' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;
}
