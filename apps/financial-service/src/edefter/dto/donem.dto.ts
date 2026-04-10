import { IsInt, IsIn, Min, Max } from 'class-validator';

/**
 * e-Defter dönem bilgisi.
 *
 * GİB e-Defter aylık dönemler halinde gönderilir.
 * Yevmiye ve Büyük Defter aynı dönem için üretilir.
 */
export class DonemDto {
  /**
   * Dönem yılı (örn: 2024)
   */
  @IsInt()
  @Min(2020)
  @Max(2099)
  yil!: number;

  /**
   * Dönem ayı (1-12)
   */
  @IsInt()
  @Min(1)
  @Max(12)
  ay!: number;
}

/**
 * Bir ay için başlangıç ve bitiş tarihlerini hesaplar.
 * Bitiş günü: ayın son günü 23:59:59.
 */
export function donemToDateRange(dto: DonemDto): {
  start: Date;
  end: Date;
} {
  const start = new Date(dto.yil, dto.ay - 1, 1);
  // Sonraki ayın 0. günü = bu ayın son günü
  const end = new Date(dto.yil, dto.ay, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * GİB'e gönderilen dönem etiketi: "2024/06"
 */
export function donemLabel(dto: DonemDto): string {
  return `${dto.yil}/${String(dto.ay).padStart(2, '0')}`;
}
