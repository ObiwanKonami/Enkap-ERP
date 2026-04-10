import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { GibProfileId, SendInvoiceDto, SgkSectoralDto, SarjSectoralDto, IlacSectoralDto, IdisSectoralDto } from './dto/send-invoice.dto';

/**
 * GİB Sektörel Fatura Validasyon Pipe'ı
 *
 * ProfileID'e göre zorunlu sektörel alan kontrollerini yapar:
 *
 *  SGK           → iban zorunlu (TR ile başlayan 26 karakter IBAN)
 *  ENERJI (SARJ) → schemeId (PLAKA|ARACKIMLIKNO) + vehicleId zorunlu
 *  ILAC_TIBBICIHAZ → gtinBarcode zorunlu (8, 12, 13 veya 14 rakam GTIN)
 *  IDIS          → shipmentNumber (SE-XXXXXXX) + labelNumber (CVXXXXXXX) zorunlu
 *
 * Diğer profileler sektörel alan gerektirmez.
 */
@Injectable()
export class SectoralValidatorPipe implements PipeTransform<SendInvoiceDto, SendInvoiceDto> {
  transform(dto: SendInvoiceDto): SendInvoiceDto {
    switch (dto.profileId) {
      case GibProfileId.SGK:
        this.validateSgk(dto.sectoral as SgkSectoralDto | undefined);
        break;
      case GibProfileId.ENERJI:
        this.validateSarj(dto.sectoral as SarjSectoralDto | undefined);
        break;
      case GibProfileId.ILAC_TIBBICIHAZ:
        this.validateIlac(dto.sectoral as IlacSectoralDto | undefined);
        break;
      case GibProfileId.IDIS:
        this.validateIdis(dto.sectoral as IdisSectoralDto | undefined);
        break;
    }
    return dto;
  }

  private validateSgk(s: SgkSectoralDto | undefined): void {
    if (!s?.iban) {
      throw new BadRequestException('SGK profili için sectoral.iban zorunludur');
    }
    // TR + 24 rakam = 26 karakter IBAN
    if (!/^TR\d{24}$/.test(s.iban)) {
      throw new BadRequestException(
        'SGK profili: sectoral.iban geçersiz — TR ile başlayan 26 karakter IBAN olmalıdır',
      );
    }
  }

  private validateSarj(s: SarjSectoralDto | undefined): void {
    if (!s?.schemeId || !s?.vehicleId) {
      throw new BadRequestException(
        'Elektrik Şarj (ENERJI) profili için sectoral.schemeId ve sectoral.vehicleId zorunludur',
      );
    }
    if (!['PLAKA', 'ARACKIMLIKNO'].includes(s.schemeId)) {
      throw new BadRequestException(
        'sectoral.schemeId değeri PLAKA veya ARACKIMLIKNO olmalıdır',
      );
    }
  }

  private validateIlac(s: IlacSectoralDto | undefined): void {
    if (!s?.gtinBarcode) {
      throw new BadRequestException('İlaç/Tıbbi Cihaz profili için sectoral.gtinBarcode zorunludur');
    }
    // GTIN: 8, 12, 13 veya 14 rakam
    if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(s.gtinBarcode)) {
      throw new BadRequestException(
        'sectoral.gtinBarcode geçersiz GTIN — 8, 12, 13 veya 14 rakam olmalıdır',
      );
    }
  }

  private validateIdis(s: IdisSectoralDto | undefined): void {
    if (!s?.shipmentNumber || !s?.labelNumber) {
      throw new BadRequestException(
        'İDİS profili için sectoral.shipmentNumber ve sectoral.labelNumber zorunludur',
      );
    }
    // GİB İDİS kılavuzu: SE-XXXXXXX format
    if (!/^SE-\d{7}$/.test(s.shipmentNumber)) {
      throw new BadRequestException(
        'sectoral.shipmentNumber geçersiz — SE-XXXXXXX (7 rakam) formatı zorunludur',
      );
    }
    // Etiket no: CV + 7 rakam
    if (!/^CV\d{7}$/.test(s.labelNumber)) {
      throw new BadRequestException(
        'sectoral.labelNumber geçersiz — CVXXXXXXX (7 rakam) formatı zorunludur',
      );
    }
  }
}
