import { Injectable } from '@nestjs/common';
import {
  PdfBase,
  PAGE,
  formatKurus,
  formatDate,
} from '@enkap/reporting';
import type { Employee } from '../employee/entities/employee.entity';
import type { Payroll }   from './entities/payroll.entity';

const MONTH_TR = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

// Renk sabitleri (template'e uygun)
const C = {
  primary:    '#1a237e',   // koyu lacivert başlık
  accent:     '#1a56db',   // parlak mavi vurgu
  netBg:      '#1a237e',   // net ücret arka plan
  cellBg:     '#f5f5f7',   // bento hücre arka planı
  headBg:     '#1a237e',   // tablo başlık arka planı
  headText:   '#ffffff',
  text:       '#111827',
  muted:      '#6b7280',
  border:     '#e5e7eb',
  success:    '#059669',
} as const;

interface CompanyProfile {
  companyName:   string;
  sgkEmployerNo: string | null;
  taxOffice:     string | null;
  vkn:           string | null;
  logoUrl:       string | null;
}

class PayslipDocument extends PdfBase {
  constructor(
    private readonly employee: Employee,
    private readonly payroll:  Payroll,
    private readonly profile:  CompanyProfile,
  ) {
    super();
  }

  protected async build(): Promise<void> {
    const { doc, employee, payroll, profile } = this;

    // TypeORM bigint → string döndürür; Number() ile düzelt
    const gross        = Number(payroll.grossKurus);
    const sgkWorker    = Number(payroll.sgkWorkerKurus);
    const unemp        = Number(payroll.unemploymentWorkerKurus);
    const incomeTax    = Number(payroll.incomeTaxKurus);
    const stampTax     = Number(payroll.stampTaxKurus);
    const exemption    = Number(payroll.minWageExemptionKurus);
    const net          = Number(payroll.netKurus);
    const sgkEmployer  = Number(payroll.sgkEmployerKurus);
    const unempEmp     = Number(payroll.unemploymentEmployerKurus);
    const totalEmpCost = Number(payroll.totalEmployerCostKurus);
    const gvBase       = Number(payroll.incomeTaxBaseKurus);
    const cumBase      = Number(payroll.cumulativeIncomeBaseKurus);

    const totalDeduction = sgkWorker + unemp + incomeTax + stampTax - exemption;
    const period         = `${MONTH_TR[payroll.periodMonth] ?? ''} ${payroll.periodYear}`;

    // TCKN maskeleme (KVKK)
    const tcknMasked = employee.tckn.length === 11
      ? `${employee.tckn.slice(0, 3)}***${employee.tckn.slice(7)}`
      : employee.tckn;

    let y = PAGE.margin;

    // ── 1. BAŞLIK BLOĞU ──────────────────────────────────────────────────────
    //
    //   Satır 1: [mavi şerit] | ÜCRET HESAP PUSULASI (büyük)  | Logo (sağ)
    //   Satır 2: Şirket adı (bold)                             | Dönem / Sicil
    //            İşyeri SGK No                                  |
    //            Vergi Dairesi                                  |
    //            Vergi No                                       |

    // ─ Satır 1: Ana başlık ────────────────────────────────────────────────
    // Sol mavi dikey şerit
    doc.rect(PAGE.margin, y, 4, 18).fill(C.accent);

    this.setFont('Bold', 16).doc
        .fillColor(C.primary)
        .text('ÜCRET HESAP PUSULASI', PAGE.margin + 12, y + 1, {
          width: PAGE.contentWidth - 12, lineBreak: false,
        });

    y += 24;

    // ─ İnce ayırıcı çizgi ─────────────────────────────────────────────────
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 0.5).fill(C.border);
    y += 8;

    // ─ Satır 2: Şirket bilgileri (sol) + Dönem/Sicil (sağ) ───────────────
    const infoTextW = (PAGE.contentWidth / 3) * 2;
    const logoW     = PAGE.contentWidth / 3 - 10;
    const rightX    = PAGE.margin + infoTextW + 10;

    // Şirket adı
    this.setFont('Bold', 10).doc
        .fillColor(C.primary)
        .text(profile.companyName, PAGE.margin, y, {
          width: infoTextW, lineBreak: false,
        });

    // Dönem ve Sicil — sağ taraf
    this.setFont('Regular', 7.5).doc
        .fillColor(C.muted)
        .text(`Dönem: ${period}`, rightX, y, {
          width: logoW, align: 'right', lineBreak: false,
        });
    this.setFont('Regular', 7.5).doc
        .fillColor(C.muted)
        .text(`Sicil: ${employee.sicilNo}`, rightX, y + 12, {
          width: logoW, align: 'right', lineBreak: false,
        });

    // SGK / Vergi bilgileri
    let infoY = y + 14;
    if (profile.sgkEmployerNo) {
      this.setFont('Regular', 8).doc
          .fillColor(C.muted)
          .text(`İşyeri SGK No: ${profile.sgkEmployerNo}`, PAGE.margin, infoY, {
            width: infoTextW, lineBreak: false,
          });
      infoY += 12;
    }
    if (profile.taxOffice) {
      this.setFont('Regular', 8).doc
          .fillColor(C.muted)
          .text(`Vergi Dairesi: ${profile.taxOffice}`, PAGE.margin, infoY, {
            width: infoTextW, lineBreak: false,
          });
      infoY += 12;
    }
    if (profile.vkn) {
      this.setFont('Regular', 8).doc
          .fillColor(C.muted)
          .text(`Vergi No: ${profile.vkn}`, PAGE.margin, infoY, {
            width: infoTextW, lineBreak: false,
          });
      infoY += 12;
    }

    // Şirket bilgileri bloğunun altından devam et
    y = infoY + 6;

    // Ayırıcı çizgi
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 1).fill(C.border);
    y += 10;

    // ── 2. PERSONEL BİLGİ BENTO GRID (2×3) ──────────────────────────────────

    const cells: Array<[string, string]> = [
      ['Ad Soyad',       `${employee.name} ${employee.surname}`],
      ['TCKN',           tcknMasked],
      ['Ünvan',          employee.title      ?? '-'],
      ['SGK No / Sicil', `${employee.sgkNo ?? '-'} / ${employee.sicilNo}`],
      ['Departman',      employee.department ?? '-'],
      ['İşe Giriş',      formatDate(new Date(employee.hireDate))],
    ];

    const colW  = (PAGE.contentWidth - 8) / 2;
    const cellH = 34;
    const gap   = 8;

    cells.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx  = PAGE.margin + col * (colW + gap);
      const cy  = y + row * (cellH + 6);

      doc.roundedRect(cx, cy, colW, cellH, 4).fill(C.cellBg);

      this.setFont('Regular', 7).doc
          .fillColor(C.muted)
          .text(label.toUpperCase(), cx + 8, cy + 7, {
            width: colW - 16, lineBreak: false,
          });

      this.setFont('Bold', 9).doc
          .fillColor(C.text)
          .text(value, cx + 8, cy + 18, {
            width: colW - 16, lineBreak: false,
          });
    });

    y += 3 * (cellH + 6) + 12;

    // ── 3. KAZANIMLAR | KESİNTİLER ───────────────────────────────────────────

    const halfW = (PAGE.contentWidth - 8) / 2;

    // Tablo başlık bloğu — Kazanımlar
    const drawSectionHeader = (label: string, x: number): void => {
      doc.rect(x, y, halfW, 20).fill(C.headBg);
      this.setFont('Bold', 9).doc
          .fillColor(C.headText)
          .text(label, x + 8, y + 6, { width: halfW - 16, lineBreak: false });
    };

    drawSectionHeader('KAZANIMLAR', PAGE.margin);
    drawSectionHeader('KESİNTİLER', PAGE.margin + halfW + 8);
    y += 20;

    // Satır çizimi yardımcıları
    let earnY = y;
    let dedY  = y;

    const earnRow = (label: string, amount: number): void => {
      this.setFont('Regular', 8).doc
          .fillColor(C.text)
          .text(label, PAGE.margin + 6, earnY, { width: halfW - 90, lineBreak: false });
      this.setFont('Bold', 8).doc
          .fillColor(C.text)
          .text(formatKurus(amount), PAGE.margin + halfW - 80, earnY, {
            width: 74, align: 'right', lineBreak: false,
          });
      earnY += 18;
    };

    const dedRow = (label: string, amount: number, accent = false): void => {
      const x     = PAGE.margin + halfW + 8;
      const color = accent ? C.success : C.text;
      this.setFont('Regular', 8).doc
          .fillColor(color)
          .text(label, x + 6, dedY, { width: halfW - 90, lineBreak: false });
      this.setFont('Bold', 8).doc
          .fillColor(color)
          .text(
            accent ? `-${formatKurus(amount)}` : formatKurus(amount),
            x + halfW - 80, dedY,
            { width: 74, align: 'right', lineBreak: false },
          );
      dedY += 18;
    };

    // Satırlar
    earnRow('Brüt Ücret', gross);
    dedRow('SGK İşçi Payı (%14)',      sgkWorker);
    dedRow('İşsizlik İşçi Payı (%1)',  unemp);
    dedRow('Gelir Vergisi',            incomeTax);
    dedRow('Damga Vergisi (%0.759)',   stampTax);
    if (exemption > 0) {
      dedRow('Asgari Ücret Muafiyeti', exemption, true);
    }

    // Sütunlar arası dikey ayırıcı
    const colDivX = PAGE.margin + halfW + 4;
    const tableBot = Math.max(earnY, dedY) + 2;
    doc.rect(colDivX, y, 1, tableBot - y).fill(C.border);

    // Yatay ayırıcı
    doc.rect(PAGE.margin, tableBot, PAGE.contentWidth, 0.5).fill(C.border);

    // Toplam satırları
    const totY = tableBot + 6;

    // Toplam Kazanım
    this.setFont('Bold', 9).doc.fillColor(C.text)
        .text('Toplam Kazanım', PAGE.margin + 6, totY, { width: halfW - 90, lineBreak: false });
    this.setFont('Bold', 9).doc.fillColor(C.accent)
        .text(formatKurus(gross), PAGE.margin + halfW - 80, totY, {
          width: 74, align: 'right', lineBreak: false,
        });

    // Toplam Kesinti
    const x2 = PAGE.margin + halfW + 8;
    this.setFont('Bold', 9).doc.fillColor(C.text)
        .text('Toplam Kesinti', x2 + 6, totY, { width: halfW - 90, lineBreak: false });
    this.setFont('Bold', 9).doc.fillColor(C.accent)
        .text(formatKurus(totalDeduction), x2 + halfW - 80, totY, {
          width: 74, align: 'right', lineBreak: false,
        });

    y = totY + 24;

    // ── 4. NET ÜCRET KUTUSU ───────────────────────────────────────────────────

    const netH = 40;
    doc.rect(PAGE.margin, y, PAGE.contentWidth, netH).fill(C.netBg);

    this.setFont('Regular', 9).doc
        .fillColor('#ffffff')
        .opacity(0.75)
        .text('NET ÜCRET', PAGE.margin + 12, y + 13, { lineBreak: false });

    this.setFont('Bold', 18).doc
        .fillColor('#ffffff')
        .opacity(1)
        .text(
          formatKurus(net),
          PAGE.margin,
          y + 10,
          { align: 'right', width: PAGE.contentWidth - 12, lineBreak: false },
        );

    if (employee.bankIban) {
      this.setFont('Regular', 7).doc
          .fillColor('#ffffff')
          .opacity(0.6)
          .text(`IBAN: ${employee.bankIban}`, PAGE.margin + 12, y + 30, { lineBreak: false });
    }

    doc.opacity(1); // opacity sıfırla
    y += netH + 16;

    // ── 5. KÜMÜLATİF ÖZET ────────────────────────────────────────────────────

    doc.rect(PAGE.margin, y, PAGE.contentWidth, 0.5).fill(C.border);
    y += 8;

    const cumItems: Array<[string, string]> = [
      ['İşveren Maliyeti Özeti (bilgi amaçlı)', ''],
      ['SGK İşveren (%18.5)', formatKurus(sgkEmployer)],
      ['İşsizlik İşveren (%2)', formatKurus(unempEmp)],
      ['Toplam İşveren Maliyeti', formatKurus(totalEmpCost)],
    ];

    this.setFont('Regular', 7).doc
        .fillColor(C.muted)
        .text(cumItems[0]![0], PAGE.margin, y, { lineBreak: false });
    y += 12;

    const iw = PAGE.contentWidth / 3;
    let ix = PAGE.margin;
    for (let i = 1; i <= 3; i++) {
      const [label, val] = cumItems[i]!;
      this.setFont('Regular', 7).doc.fillColor(C.muted)
          .text(label, ix, y, { width: iw - 4, lineBreak: false });
      this.setFont('Bold', 8).doc.fillColor(C.text)
          .text(val, ix, y + 10, { width: iw - 4, lineBreak: false });
      ix += iw;
    }

    y += 26;
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 0.5).fill(C.border);
    y += 8;

    // GV Matrah özeti
    this.setFont('Regular', 7).doc
        .fillColor(C.muted)
        .text(
          `Gelir Vergisi Matrahı (bu ay): ${formatKurus(gvBase)}  |  Kümülatif Matrah: ${formatKurus(cumBase)}`,
          PAGE.margin, y,
        );

    y += 24;

    // ── 6. İMZA ALANLARI ─────────────────────────────────────────────────────

    const sigW = (PAGE.contentWidth - 20) / 2;
    const sigY = PAGE.height - PAGE.margin - 70;

    // Sol — İşveren
    doc.rect(PAGE.margin, sigY, sigW, 0.5).fill(C.text);
    this.setFont('Bold', 7).doc.fillColor(C.text)
        .text('İŞVEREN KAŞE / İMZA', PAGE.margin, sigY + 5, {
          width: sigW, lineBreak: false,
        });
    this.setFont('Regular', 6).doc.fillColor(C.muted)
        .text(
          `Tarih: ${formatDate(new Date())}`,
          PAGE.margin, sigY + 5,
          { align: 'right', width: sigW, lineBreak: false },
        );
    this.setFont('Regular', 6).doc.fillColor(C.muted)
        .text(
          'Bu belge Enkap ERP sistemi üzerinden otomatik oluşturulmuştur.',
          PAGE.margin, sigY + 18,
          { width: sigW },
        );

    // Sağ — Personel
    const sigX2 = PAGE.margin + sigW + 20;
    doc.rect(sigX2, sigY, sigW, 0.5).fill(C.text);
    this.setFont('Bold', 7).doc.fillColor(C.text)
        .text('PERSONEL İMZA', sigX2, sigY + 5, { width: sigW, lineBreak: false });
    this.setFont('Regular', 6).doc.fillColor(C.muted)
        .text(
          'İmza Tarihi: ____/____/202__',
          sigX2, sigY + 5,
          { align: 'right', width: sigW, lineBreak: false },
        );
    this.setFont('Regular', 6).doc.fillColor(C.muted)
        .text(
          'Yukarıda dökümü yapılan net ücretimi tam olarak aldığımı beyan ederim.',
          sigX2, sigY + 18,
          { width: sigW },
        );

    this.drawPageFooter(new Date());
  }
}

@Injectable()
export class PayslipBuilderService {
  async build(
    employee: Employee,
    payroll:  Payroll,
    profile:  CompanyProfile = { companyName: 'Enkap Kullanıcısı', sgkEmployerNo: null, taxOffice: null, vkn: null, logoUrl: null },
  ): Promise<Buffer> {
    return new PayslipDocument(employee, payroll, profile).toBuffer();
  }
}
