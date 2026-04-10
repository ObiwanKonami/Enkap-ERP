import { IsUUID, IsString, IsOptional, IsIn, Length, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * GİB Profil ID (ProfileID)
 * UBL-TR 1.2.1 Kılavuzuna göre fatura türü profilleri.
 */
export enum GibProfileId {
  TEMELFATURA       = 'TEMELFATURA',
  TICARIFATURA      = 'TICARIFATURA',
  EARSIVFATURA      = 'EARSIVFATURA',
  ENERJI            = 'ENERJI',
  ILAC_TIBBICIHAZ   = 'ILAC_TIBBICIHAZ',
  IDIS              = 'IDIS',
  SGK               = 'SGK',
}

/**
 * GİB Fatura Tür Kodu (InvoiceTypeCode)
 * UBL-TR 1.2.1'de tanımlı belge tür kodları.
 */
export enum GibInvoiceTypeCode {
  SATIS     = 'SATIS',
  IADE      = 'IADE',
  TEVKIFAT  = 'TEVKIFAT',
  SARJ      = 'SARJ',
  SARJANLIK = 'SARJANLIK',
}

export class SendInvoiceDto {
  @ApiProperty({ description: 'Fatura UUID', format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ enum: GibProfileId, description: 'GİB profil ID (TEMELFATURA, TICARIFATURA vb.)' })
  @IsEnum(GibProfileId)
  profileId!: GibProfileId;

  @ApiProperty({ enum: GibInvoiceTypeCode, description: 'GİB fatura tür kodu' })
  @IsEnum(GibInvoiceTypeCode)
  invoiceTypeCode!: GibInvoiceTypeCode;

  @ApiProperty({ description: 'GİB belge numarası (16 hane, Örn: ENK2024000000001)', maxLength: 16 })
  @IsString()
  @Length(16, 16)
  documentNumber!: string;

  @ApiPropertyOptional({ description: 'Gönderici GB etiketi (Örn: urn:mail:defaultgb@enkap.com.tr)' })
  @IsString()
  @IsOptional()
  senderAlias?: string;

  @ApiPropertyOptional({ description: 'Alıcı PK etiketi (Örn: urn:mail:defaultpk@alici.com.tr)' })
  @IsString()
  @IsOptional()
  receiverAlias?: string;

  @ApiPropertyOptional({ description: 'Sektörel alanlar (SGK, ENERJI, ILAC_TIBBICIHAZ, IDIS profilleri için)' })
  @IsOptional()
  sectoral?: SectoralDto;
}

/** SectoralDto — tüm sektörel DTO varyantlarının union tipi */
export type SectoralDto = SgkSectoralDto | SarjSectoralDto | IlacSectoralDto | IdisSectoralDto;

/** Sektörel alan: Kamu (SGK) */
export class SgkSectoralDto {
  @ApiProperty({ description: 'SGK ödemesi için IBAN (UBL: PaymentMeans/PayeeFinancialAccount/ID)' })
  @IsString()
  iban!: string;
}

/** Sektörel alan: Elektrik Şarj */
export class SarjSectoralDto {
  @ApiProperty({ enum: ['PLAKA', 'ARACKIMLIKNO'], description: 'Araç tanımlama şema türü' })
  @IsIn(['PLAKA', 'ARACKIMLIKNO'])
  schemeId!: 'PLAKA' | 'ARACKIMLIKNO';

  @ApiProperty({ description: 'Plaka veya şasi numarası' })
  @IsString()
  vehicleId!: string;
}

/** Sektörel alan: İlaç / Tıbbi Cihaz (kalem bazında) */
export class IlacSectoralDto {
  @ApiProperty({ description: 'UTS/İTS GTIN barkod formatı: GTINxxxBNxxxSNxxxXDxxx' })
  @IsString()
  gtinBarcode!: string;
}

/** Sektörel alan: İDİS */
export class IdisSectoralDto {
  @ApiProperty({ description: 'Sevkiyat Numarası (SE-XXXXXXX formatı)' })
  @IsString()
  shipmentNumber!: string;

  @ApiProperty({ description: 'Etiket Numarası (CVXXXXXXX formatı)' })
  @IsString()
  labelNumber!: string;
}
