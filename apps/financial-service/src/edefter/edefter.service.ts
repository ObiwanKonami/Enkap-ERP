import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { AccountService } from '../account/account.service';
import { YevmiyeBuilderService } from './yevmiye/yevmiye-builder.service';
import { BuyukDefterService } from './buyukdefter/buyukdefter.service';
import { DonemDto, donemToDateRange, donemLabel } from './dto/donem.dto';

export interface EdEfterResult {
  donem:            string;
  yevmiyeXml:       string;
  buyukDefterXml:   string;
  /** İmzalı yevmiye XML (Java servisten döner) */
  yevmiyeSigned?:   string;
  /** İmzalı büyük defter XML */
  buyukDefterSigned?: string;
  /** GİB'e gönderildi mi */
  submitted:        boolean;
  submittedAt?:     Date;
  gibResponse?:     unknown;
  mizan: {
    isBalanced:    boolean;
    toplamBorc:    string;
    toplamAlacak:  string;
  };
}

/**
 * e-Defter servisi — Yevmiye ve Büyük Defter orchestrator.
 *
 * Akış:
 *  1. Mizan kontrolü → dönem borç = alacak olmalı (GİB reddi önleme)
 *  2. Paralel XML üretimi (yevmiye + büyük defter)
 *  3. Her iki XML'i Java imzalama servisine gönder (XAdES-T)
 *  4. İmzalı XML'leri GİB'e gönder
 *  5. Sonuçları tenant DB'ye kaydet (audit trail)
 *
 * GİB e-Defter gönderim kuralları:
 *  - Bir dönem için en fazla 3 gönderim denemesi
 *  - Dönem kapanışından itibaren 45 gün içinde gönderilmeli
 *  - e-Defter beratı GİB'ten alınmalı (şifreli hash)
 */
@Injectable()
export class EdEfterService {
  private readonly logger = new Logger(EdEfterService.name);

  // Java imzalama servisi
  private readonly SIGNER_ENDPOINT =
    process.env.GIB_SIGNER_ENDPOINT ?? 'http://gib-signer:8080';

  // GİB e-Defter endpoint'i
  private readonly GIB_EDEFTER_ENDPOINT =
    process.env.GIB_EDEFTER_ENDPOINT ??
    'https://edefter.gib.gov.tr/edefter/services/EDefter';

  constructor(
    private readonly accountService: AccountService,
    private readonly yevmiyeBuilder: YevmiyeBuilderService,
    private readonly buyukDefterService: BuyukDefterService,
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Dönem için e-Defter üretir ve GİB'e gönderir.
   *
   * @param donem   Dönem (yıl + ay)
   * @param vkn     Şirket vergi kimlik numarası (10 hane)
   * @param unvan   Şirket ünvanı
   * @param submit  true ise GİB'e gönder, false ise sadece XML üret (önizleme)
   */
  async processEdEfter(
    donem: DonemDto,
    vkn: string,
    unvan: string,
    submit = false,
  ): Promise<EdEfterResult> {
    const { tenantId } = getTenantContext();
    const { start, end } = donemToDateRange(donem);
    const label = donemLabel(donem);

    this.logger.log(
      `e-Defter işlemi başlatıldı: tenant=${tenantId} dönem=${label} submit=${submit}`,
    );

    // ──── [1] Mizan Kontrolü ─────────────────────────────────────────────
    const mizan = await this.accountService.getMizan(start, end);

    if (!mizan.isBalanced) {
      this.logger.error(
        `Mizan dengeli değil! tenant=${tenantId} dönem=${label} ` +
        `borç=${mizan.totalDebit.toDecimal()} alacak=${mizan.totalCredit.toDecimal()}`,
      );
      // GİB dengeli olmayan e-Defter reddeder — önceden uyar
      throw new BadRequestException(
        `${label} dönemi mizanı dengeli değil. ` +
        `Toplam borç: ₺${mizan.totalDebit.toDecimal()}, ` +
        `Toplam alacak: ₺${mizan.totalCredit.toDecimal()}. ` +
        `Muhasebe hatalarını düzeltin ve tekrar deneyin.`,
      );
    }

    // ──── [2] Paralel XML Üretimi ─────────────────────────────────────────
    const [yevmiyeXml, buyukDefterXml] = await Promise.all([
      this.yevmiyeBuilder.buildYevmiyeXml(donem, vkn, unvan, start, end),
      this.buyukDefterService.buildBuyukDefterXml(donem, vkn, unvan, start, end),
    ]);

    this.logger.log(
      `XML üretildi: dönem=${label} ` +
      `yevmiye=${yevmiyeXml.length}B buyukDefter=${buyukDefterXml.length}B`,
    );

    const result: EdEfterResult = {
      donem: label,
      yevmiyeXml,
      buyukDefterXml,
      submitted: false,
      mizan: {
        isBalanced:   true,
        toplamBorc:   String(mizan.totalDebit.toDecimal()),
        toplamAlacak: String(mizan.totalCredit.toDecimal()),
      },
    };

    if (!submit) {
      // Sadece XML önizleme — imzalama ve gönderim yapma
      return result;
    }

    // ──── [3] XAdES-T İmzalama (Java Servisi) ────────────────────────────
    const [yevmiyeSigned, buyukDefterSigned] = await Promise.all([
      this.signWithJava(yevmiyeXml, 'YEVMIYE', label),
      this.signWithJava(buyukDefterXml, 'BUYUKDEFTER', label),
    ]);

    result.yevmiyeSigned     = yevmiyeSigned;
    result.buyukDefterSigned = buyukDefterSigned;

    // ──── [4] GİB'e Gönder ───────────────────────────────────────────────
    const gibResponse = await this.submitToGib(
      yevmiyeSigned,
      buyukDefterSigned,
      donem,
      vkn,
    );

    result.submitted    = true;
    result.submittedAt  = new Date();
    result.gibResponse  = gibResponse;

    // ──── [5] Audit Trail ─────────────────────────────────────────────────
    await this.saveSubmissionRecord(tenantId, donem, result);

    this.logger.log(
      `e-Defter gönderildi: tenant=${tenantId} dönem=${label}`,
    );

    return result;
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  /**
   * Java BouncyCastle servisi ile XAdES-T imzalama.
   * e-Fatura imzalamayla aynı endpoint, farklı documentType parametresi.
   */
  private async signWithJava(
    xml: string,
    documentType: 'YEVMIYE' | 'BUYUKDEFTER',
    donem: string,
  ): Promise<string> {
    try {
      const response = await fetch(`${this.SIGNER_ENDPOINT}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, documentType, donem }),
        signal: AbortSignal.timeout(60_000), // 60 saniye
      });

      if (!response.ok) {
        throw new Error(`Java signer hatası: ${response.status}`);
      }

      const { signedXml } = (await response.json()) as { signedXml: string };
      return signedXml;
    } catch (err) {
      this.logger.error(
        `XAdES-T imzalama başarısız: ${documentType} dönem=${donem}`,
        (err as Error).message,
      );
      throw new InternalServerErrorException(
        `${documentType} imzalanamadı: ${(err as Error).message}`,
      );
    }
  }

  /**
   * İmzalı Yevmiye ve Büyük Defter'i GİB'e gönderir.
   *
   * GİB e-Defter web servisi SOAP tabanlıdır.
   * TODO: Gerçek GİB SOAP entegrasyonu (GİB anlaşması sonrası)
   */
  private async submitToGib(
    yevmiyeSigned: string,
    buyukDefterSigned: string,
    donem: DonemDto,
    vkn: string,
  ): Promise<unknown> {
    // TODO: GİB e-Defter SOAP servisi entegrasyonu
    // Gerçek implementasyonda:
    //   1. SOAP envelope oluştur
    //   2. GİB credentials ile authenticate ol
    //   3. Her iki XML'i ayrı web servis çağrısıyla gönder
    //   4. "Berat" dosyasını al ve sakla
    this.logger.warn(
      `GİB e-Defter gönderimi stub: dönem=${donemLabel(donem)} vkn=${vkn}`,
    );
    void yevmiyeSigned;
    void buyukDefterSigned;

    return {
      status: 'STUB',
      message: 'GİB e-Defter entegrasyonu henüz tamamlanmadı.',
      donem: donemLabel(donem),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Gönderim sonucunu tenant DB'ye kaydeder (audit trail).
   * edefter_submissions tablosu — V006 migration'ında oluşturulacak.
   *
   * TODO: V006 migration + edefter_submissions tablosu
   */
  private async saveSubmissionRecord(
    tenantId: string,
    donem: DonemDto,
    result: EdEfterResult,
  ): Promise<void> {
    try {
      const ds = await this.dataSourceManager.getDataSource(tenantId);
      await ds.query(
        `INSERT INTO edefter_submissions (
           tenant_id, donem_yil, donem_ay, submitted_at,
           gib_response, is_balanced
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, donem_yil, donem_ay) DO UPDATE
           SET submitted_at  = EXCLUDED.submitted_at,
               gib_response  = EXCLUDED.gib_response`,
        [
          tenantId,
          donem.yil,
          donem.ay,
          result.submittedAt,
          JSON.stringify(result.gibResponse),
          result.mizan.isBalanced,
        ],
      );
    } catch (err) {
      // Kayıt başarısız → gönderim sonucunu etkileme
      this.logger.warn(
        `e-Defter audit kaydı yapılamadı: ${(err as Error).message}`,
      );
    }
  }
}
