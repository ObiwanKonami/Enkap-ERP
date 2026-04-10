import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  InvoiceType,
  InvoiceDirection,
  Currency,
  KdvRate,
} from '@enkap/shared-types';

export class CreateInvoiceLineDto {
  @ApiPropertyOptional({ description: 'Ürün UUID — stok bağlantısı için' })
  productId?: string;

  @ApiProperty({ description: 'Satır açıklaması' })
  description!: string;

  @ApiProperty({ description: 'Miktar', example: 1 })
  quantity!: number;

  @ApiProperty({ description: 'Birim', example: 'adet', default: 'adet' })
  unit: string = 'adet';

  @ApiProperty({ description: 'Birim fiyat (TL cinsinden)', example: 100 })
  unitPrice!: number;

  @ApiPropertyOptional({ description: 'İskonto yüzdesi (0-100)', default: 0, example: 0 })
  discountPct: number = 0;

  @ApiProperty({ description: 'KDV oranı (%)', enum: [0, 1, 10, 20], example: 20 })
  kdvRate!: KdvRate;
}

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Fatura tipi', enum: ['INVOICE', 'CREDIT_NOTE', 'PROFORMA'], example: 'INVOICE' })
  invoiceType!: InvoiceType;

  @ApiProperty({ description: 'Fatura yönü — OUT: satış, IN: alış', enum: ['OUT', 'IN'], example: 'OUT' })
  direction!: InvoiceDirection;

  /** Satış faturası için zorunlu */
  @ApiPropertyOptional({ description: 'Müşteri UUID — satış faturası için zorunlu' })
  customerId?: string;

  /** Alış faturası için zorunlu */
  @ApiPropertyOptional({ description: 'Tedarikçi UUID — alış faturası için zorunlu' })
  vendorId?: string;

  @ApiProperty({ description: 'Fatura tarihi (ISO 8601)', example: '2026-03-18' })
  issueDate!: string; // ISO 8601: "2026-03-18"

  @ApiPropertyOptional({ description: 'Vade tarihi (ISO 8601)', example: '2026-04-18' })
  dueDate?: string;

  @ApiProperty({ description: 'Para birimi', enum: ['TRY', 'USD', 'EUR'], default: 'TRY', example: 'TRY' })
  currency: Currency = 'TRY';

  @ApiPropertyOptional({ description: 'Döviz kuru (TRY bazında)', default: 1, example: 1 })
  exchangeRate: number = 1;

  @ApiPropertyOptional({ description: 'Fatura notu / açıklama' })
  notes?: string;

  @ApiProperty({ description: 'Fatura satırları', type: [CreateInvoiceLineDto] })
  lines!: CreateInvoiceLineDto[];
}

export class CreateInvoiceFromOrderDto {
  @ApiProperty({ description: 'Satış siparişi UUID (order-service)' })
  salesOrderId!: string;

  @ApiPropertyOptional({ description: 'Vade tarihi (ISO 8601) — boşsa sipariş tarihi + 30 gün' })
  dueDate?: string;

  @ApiPropertyOptional({ description: 'e-Fatura olarak GİB\'e gönder', default: false })
  sendToGib: boolean = false;

  @ApiPropertyOptional({ description: 'Fatura notu' })
  notes?: string;
}

export class ApproveInvoiceDto {
  @ApiProperty({ description: 'Onaylanacak fatura UUID' })
  invoiceId!: string;

  /** e-Fatura için GİB'e gönder */
  @ApiPropertyOptional({ description: 'e-Fatura olarak GİB\'e gönder', default: false })
  sendToGib: boolean = false;
}

export class CancelInvoiceDto {
  @ApiProperty({ description: 'İptal edilecek fatura UUID' })
  invoiceId!: string;

  @ApiProperty({ description: 'İptal gerekçesi' })
  reason!: string;
}
