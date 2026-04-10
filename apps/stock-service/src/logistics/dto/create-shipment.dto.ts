import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEmail,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarrierCode, PaymentType, ShipmentStatus } from '../entities/shipment.entity';

/** Yeni kargo gönderisi oluşturma isteği */
export class CreateShipmentDto {
  @ApiProperty({ enum: CarrierCode, description: 'Kargo firması kodu' })
  @IsEnum(CarrierCode)
  carrier!: CarrierCode;

  @ApiProperty({ description: 'Sipariş veya irsaliye referans numarası' })
  @IsString()
  @IsNotEmpty()
  orderReference!: string;

  // ---- Gönderici ----

  @ApiProperty({ description: 'Gönderici adı soyadı / firma adı' })
  @IsString()
  @IsNotEmpty()
  senderName!: string;

  @ApiProperty({ description: 'Gönderici açık adresi' })
  @IsString()
  @IsNotEmpty()
  senderAddress!: string;

  @ApiProperty({ description: 'Gönderici şehri' })
  @IsString()
  @IsNotEmpty()
  senderCity!: string;

  @ApiProperty({ description: 'Gönderici telefon numarası' })
  @IsString()
  @IsNotEmpty()
  senderPhone!: string;

  // ---- Alıcı ----

  @ApiProperty({ description: 'Alıcı adı soyadı' })
  @IsString()
  @IsNotEmpty()
  recipientName!: string;

  @ApiProperty({ description: 'Alıcı açık adresi' })
  @IsString()
  @IsNotEmpty()
  recipientAddress!: string;

  @ApiProperty({ description: 'Alıcı şehri' })
  @IsString()
  @IsNotEmpty()
  recipientCity!: string;

  @ApiPropertyOptional({ description: 'Alıcı ilçesi' })
  @IsOptional()
  @IsString()
  recipientDistrict?: string;

  @ApiProperty({ description: 'Alıcı telefon numarası' })
  @IsString()
  @IsNotEmpty()
  recipientPhone!: string;

  @ApiPropertyOptional({ description: 'Alıcı e-posta — teslim bildirimi için' })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  // ---- Paket ----

  @ApiProperty({ description: 'Gerçek ağırlık (kg)', minimum: 0.1, maximum: 999 })
  @IsNumber()
  @Min(0.1)
  @Max(999)
  weightKg!: number;

  @ApiPropertyOptional({ description: 'Hacimsel ağırlık (desi) — boşsa kargo firması hesaplar' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  desi?: number;

  @ApiPropertyOptional({
    enum: PaymentType,
    description: 'Kargo ücret ödeme tipi',
    default: PaymentType.SENDER,
  })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;
}

/** Takip numarası ile durum sorgulama (açık endpoint) */
export class TrackShipmentDto {
  @ApiProperty({ description: 'Kargo takip numarası' })
  @IsString()
  @IsNotEmpty()
  trackingNumber!: string;

  @ApiProperty({ enum: CarrierCode, description: 'Kargo firması kodu' })
  @IsEnum(CarrierCode)
  carrier!: CarrierCode;
}

/**
 * Kargo firmasından gelen webhook bildirimi.
 * Kargo firması, durum değişikliklerini bu DTO formatında gönderir.
 */
export class UpdateShipmentStatusDto {
  @ApiProperty({ description: 'Kargo firmasının iç gönderi ID\'si' })
  @IsString()
  @IsNotEmpty()
  carrierShipmentId!: string;

  @ApiProperty({ enum: ShipmentStatus, description: 'Yeni kargo durumu' })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiProperty({ description: 'Kargo firmasından gelen durum açıklaması' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Durum değişikliği zamanı (ISO 8601)' })
  @IsString()
  timestamp!: string;
}
