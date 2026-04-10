import { IsString, IsOptional, IsDateString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * GİB Portalında İptal İşaretleme DTO
 *
 * GİB portalından yapılan iptaller Enkap'a bildirilmez.
 * Bu DTO, kullanıcının "GİB Portalında İptal Edildi" butonuna tıkladığında
 * gönderdiği veriyi temsil eder.
 *
 * Endpoint: PATCH /gib/invoices/:id/mark-cancelled-on-portal
 */
export class MarkCancelledOnPortalDto {
  @ApiPropertyOptional({
    description: 'GİB portal iptal referans numarası (portal ekranından alınır)',
    example: 'GIB-PORTAL-CANCEL-2024-001',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  gibPortalRef?: string;

  @ApiPropertyOptional({
    description: 'GİB portalında iptalin gerçekleştiği tarih/saat (ISO 8601)',
    example: '2026-04-01T14:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  cancelledAt?: string;

  @ApiPropertyOptional({
    description: 'İptal gerekçesi (isteğe bağlı not)',
    example: 'Hatalı tutar girildi',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export interface MarkCancelledResultDto {
  success: boolean;
  invoiceId: string;
  previousStatus: string;
}
