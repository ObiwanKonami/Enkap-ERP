import {
  IsString,
  IsUUID,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StockMovementType } from '@enkap/shared-types';

const MOVEMENT_TYPES: StockMovementType[] = [
  'GIRIS', 'CIKIS', 'TRANSFER', 'SAYIM',
  'IADE_GIRIS', 'IADE_CIKIS', 'FIRE',
];

export class CreateMovementDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Ürün UUID', format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', description: 'Kaynak depo UUID', format: 'uuid' })
  @IsUUID()
  warehouseId!: string;

  /** Sadece TRANSFER tipinde gerekli */
  @ApiPropertyOptional({ example: 'c3d4e5f6-a7b8-9012-cdef-123456789012', description: 'Hedef depo UUID — yalnızca TRANSFER tipinde zorunlu', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetWarehouseId?: string;

  @ApiProperty({ example: 'GIRIS', description: 'Hareket tipi', enum: ['GIRIS', 'CIKIS', 'TRANSFER', 'SAYIM', 'IADE_GIRIS', 'IADE_CIKIS', 'FIRE'] })
  @IsEnum(MOVEMENT_TYPES, { message: 'Geçerli hareket tipi seçiniz' })
  type!: StockMovementType;

  @ApiProperty({ example: 10, description: 'Hareket miktarı (pozitif tam sayı)' })
  @IsNumber()
  @IsPositive({ message: 'Miktar pozitif olmalıdır' })
  quantity!: number;

  /**
   * Birim maliyet (kuruş) — opsiyonel.
   * GIRIS ve IADE_GIRIS için girilmesi önerilir; girilmezse 0 kullanılır.
   * CIKIS ve FIRE için maliyet motoru (FIFO/AVG) otomatik hesaplar.
   */
  @ApiPropertyOptional({ example: 250000, description: 'Birim maliyet (kuruş) — GIRIS/IADE_GIRIS için önerilir; CIKIS/FIRE için maliyet motoru otomatik hesaplar' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCostKurus?: number;

  @ApiPropertyOptional({ example: 'invoice', description: 'Referans belge tipi (örn. invoice, order, return)' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ example: 'PO-2026-0012', description: 'Referans belge no (fatura no, sipariş no vb.)' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ example: 'LOT-2026-001', description: 'Lot/parti numarası — farmasötik, gıda, kimyasal ürünler için' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ example: 'SN-ABC-12345', description: 'Seri numarası — elektronik, ekipman gibi bireysel takip için' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ example: 'Tedarikçi faturası ile giriş yapıldı', description: 'Hareket notları' })
  @IsOptional()
  @IsString()
  notes?: string;
}
