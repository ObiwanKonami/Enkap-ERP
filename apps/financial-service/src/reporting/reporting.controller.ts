import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantGuard, RolesGuard, Roles, getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import {
  InvoiceTemplate,
  MizanTemplate,
  ExcelBuilderService,
  type InvoiceReportData,
  type MizanReportData,
} from '@enkap/reporting';
import { InvoiceService } from '../invoice/invoice.service';
import { AccountService } from '../account/account.service';

/**
 * Finansal Raporlama API'si.
 *
 * GET /reports/fatura/pdf          — Fatura PDF (tek fatura: ?invoiceId=xxx)
 * GET /reports/fatura/excel        — Fatura listesi Excel (dönem: ?from=&to=)
 * GET /reports/mizan/pdf           — Mizan PDF
 * GET /reports/mizan/excel         — Mizan Excel
 */
@ApiTags('reporting')
@ApiBearerAuth('JWT')
@Controller('reports')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI, Role.SALT_OKUNUR)
export class ReportingController {
  constructor(
    private readonly invoiceTemplate: InvoiceTemplate,
    private readonly mizanTemplate: MizanTemplate,
    private readonly excel: ExcelBuilderService,
    private readonly invoiceService: InvoiceService,
    private readonly accountService: AccountService,
    private readonly dataSourceManager: TenantDataSourceManager,
    @InjectDataSource('control_plane') private readonly controlPlane: DataSource,
  ) {}

  /** GET /reports/fatura/pdf?invoiceId=xxx */
  @ApiOperation({ summary: 'Fatura PDF indir', description: 'Belirtilen fatura için PDF belgesi oluşturur ve indirir' })
  @ApiQuery({ name: 'invoiceId', required: true, description: 'Fatura UUID' })
  @ApiResponse({ status: 200, description: 'PDF dosyası (application/pdf)' })
  @ApiResponse({ status: 400, description: 'invoiceId zorunludur' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Fatura bulunamadı' })
  @Get('fatura/pdf')
  async faturaPdf(
    @Query('invoiceId') invoiceId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!invoiceId) throw new BadRequestException('invoiceId zorunludur.');

    const { tenantId } = getTenantContext();
    const invoice = await this.invoiceService.findOne(invoiceId);

    const data: InvoiceReportData = await this.mapInvoiceToReport(invoice, tenantId);
    const buffer = await this.invoiceTemplate.setData(data).toBuffer();

    void reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename="fatura-${invoice.invoiceNumber}.pdf"`,
      )
      .send(buffer);
  }

  /** GET /reports/fatura/excel?from=2026-01-01&to=2026-03-31 */
  @ApiOperation({ summary: 'Fatura listesi Excel indir', description: 'Belirtilen dönemdeki fatura listesini Excel dosyası olarak indirir' })
  @ApiQuery({ name: 'from', required: false, description: 'Dönem başlangıç tarihi (ISO 8601)', example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, description: 'Dönem bitiş tarihi (ISO 8601)', example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Excel dosyası (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('fatura/excel')
  async faturaExcel(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const periodStart = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodEnd   = to   ? new Date(to)   : new Date();

    const { tenantId } = getTenantContext();
    // findAll'da tarih filtresi yok — tüm faturalar, istemci tarafında filtrele
    // TODO: InvoiceService.findAll'a issueDate filtresi ekle
    const { items: invoices } = await this.invoiceService.findAll({ limit: 1000 });

    const reportData: InvoiceReportData[] = await Promise.all(
      invoices.map((inv) => this.mapInvoiceToReport(inv, tenantId)),
    );

    const buffer = await this.excel.buildFaturaExcel(reportData);

    void reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="faturalar.xlsx"')
      .send(buffer);
  }

  /** GET /reports/mizan/pdf?from=2026-01-01&to=2026-03-31 */
  @ApiOperation({ summary: 'Mizan PDF indir', description: 'Belirtilen dönem için mizan raporunu PDF dosyası olarak indirir' })
  @ApiQuery({ name: 'from', required: false, description: 'Dönem başlangıç tarihi (ISO 8601)', example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, description: 'Dönem bitiş tarihi (ISO 8601)', example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'PDF dosyası (application/pdf)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('mizan/pdf')
  async mizanPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { tenantId } = getTenantContext();
    const periodStart = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodEnd   = to   ? new Date(to)   : new Date();

    const mizan  = await this.accountService.getMizan(periodStart, periodEnd);
    const data   = await this.mapMizanToReport(mizan, tenantId, periodStart, periodEnd);
    const buffer = await this.mizanTemplate.setData(data).toBuffer();

    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="mizan.pdf"')
      .send(buffer);
  }

  /** GET /reports/mizan/excel?from=2026-01-01&to=2026-03-31 */
  @ApiOperation({ summary: 'Mizan Excel indir', description: 'Belirtilen dönem için mizan raporunu Excel dosyası olarak indirir' })
  @ApiQuery({ name: 'from', required: false, description: 'Dönem başlangıç tarihi (ISO 8601)', example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, description: 'Dönem bitiş tarihi (ISO 8601)', example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'Excel dosyası (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('mizan/excel')
  async mizanExcel(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { tenantId } = getTenantContext();
    const periodStart = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const periodEnd   = to   ? new Date(to)   : new Date();

    const mizan  = await this.accountService.getMizan(periodStart, periodEnd);
    const data   = await this.mapMizanToReport(mizan, tenantId, periodStart, periodEnd);
    const buffer = await this.excel.buildMizanExcel(data);

    void reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="mizan.xlsx"')
      .send(buffer);
  }

  // ─── Mapper'lar ──────────────────────────────────────────────────────────

  private async mapInvoiceToReport(
    invoice: Awaited<ReturnType<InvoiceService['findOne']>>,
    tenantId: string,
  ): Promise<InvoiceReportData> {
    // Karşı taraf (alıcı/tedarikçi) bilgilerini çöz
    type PartyRow = {
      name: string;
      vkn: string | null;
      tax_office: string | null;
      mersis_no: string | null;
      address: string | null;
    };
    let party: PartyRow | null = null;
    try {
      const ds = await this.dataSourceManager.getDataSource(tenantId);
      if (invoice.customerId) {
        const rows = await ds.query<(PartyRow & { first_name: string; last_name: string; company_name?: string })[]>(
          `SELECT first_name, last_name, company_name,
                  vkn, tax_office, mersis_no, address
           FROM crm_contacts WHERE id = $1 LIMIT 1`,
          [invoice.customerId],
        );
        if (rows[0]) {
          party = {
            name:       rows[0].company_name?.trim() || `${rows[0].first_name} ${rows[0].last_name}`.trim(),
            vkn:        rows[0].vkn,
            tax_office: rows[0].tax_office,
            mersis_no:  rows[0].mersis_no,
            address:    rows[0].address,
          };
        }
      } else if (invoice.vendorId) {
        const rows = await ds.query<PartyRow[]>(
          `SELECT name, tax_id AS vkn, tax_office, mersis_no, address
           FROM vendors WHERE id = $1 LIMIT 1`,
          [invoice.vendorId],
        );
        if (rows[0]) party = rows[0];
      }
    } catch {
      // Karşı taraf bilgisi çözümlenemezse boş bırak
    }

    // Tenant şirket profilini control_plane'den çek
    type ProfileRow = {
      company_name: string;
      vkn:          string | null;
      tax_office:   string | null;
      mersis_no:    string | null;
      address:      string | null;
      district:     string | null;
      city:         string | null;
      phone:        string | null;
      email:        string | null;
      iban:         string | null;
    };
    let profile: ProfileRow | null = null;
    try {
      const rows = await this.controlPlane.query<ProfileRow[]>(
        `SELECT company_name, vkn, tax_office, mersis_no,
                address, district, city, phone, email, iban
         FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      profile = rows[0] ?? null;
    } catch {
      // Profil çekilemezse boş bırak
    }

    const companyAddress = [
      profile?.address,
      profile?.district,
      profile?.city,
    ].filter(Boolean).join(', ');

    return {
      companyName:      profile?.company_name    ?? 'Enkap Kullanıcısı',
      companyVkn:       profile?.vkn             ?? '',
      companyTaxOffice: profile?.tax_office      ?? undefined,
      companyMersisNo:  profile?.mersis_no       ?? undefined,
      companyAddress,
      companyPhone:     profile?.phone           ?? undefined,
      companyEmail:     profile?.email           ?? undefined,
      bankAccount:      profile?.iban            ?? undefined,
      invoiceNumber:    invoice.invoiceNumber,
      gibUuid:          invoice.gibUuid?.toString() ?? undefined,
      invoiceType:      invoice.invoiceType,
      direction:        invoice.direction,
      issueDate:        new Date(invoice.issueDate),
      dueDate:          invoice.dueDate ? new Date(invoice.dueDate) : undefined,
      partyName:        party?.name              ?? '',
      partyVkn:         party?.vkn               ?? undefined,
      partyTaxOffice:   party?.tax_office        ?? undefined,
      partyMersisNo:    party?.mersis_no         ?? undefined,
      partyAddress:     party?.address           ?? undefined,
      currency:         invoice.currency,
      exchangeRate:     Number(invoice.exchangeRate),
      lines: (invoice.lines ?? []).map((l, i) => ({
        lineNumber:     i + 1,
        description:    l.description,
        quantity:       Number(l.quantity),
        unit:           l.unit,
        unitPriceKurus: Math.round(Number(l.unitPrice)),
        discountPct:    Number(l.discountPct),
        kdvRate:        Number(l.kdvRate),
        kdvAmountKurus: Math.round(Number(l.kdvAmount)),
        lineTotalKurus: Math.round(Number(l.lineTotal)),
      })),
      subtotalKurus:    Math.round(Number(invoice.subtotal)),
      kdvBreakdown:     this.buildKdvBreakdown(invoice.lines ?? []),
      totalKurus:       Math.round(Number(invoice.total)),
      status:           invoice.status,
    };
  }

  private buildKdvBreakdown(
    lines: Array<{ kdvRate: number | string; kdvAmount: number | string }>,
  ): InvoiceReportData['kdvBreakdown'] {
    const map = new Map<number, number>();
    for (const l of lines) {
      const rate   = Number(l.kdvRate);
      const amount = Math.round(Number(l.kdvAmount)); // DB'de kuruş — ×100 yok
      map.set(rate, (map.get(rate) ?? 0) + amount);
    }
    return Array.from(map.entries()).map(([rate, amountKurus]) => ({ rate, amountKurus }));
  }

  private async mapMizanToReport(
    mizan: Awaited<ReturnType<AccountService['getMizan']>>,
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MizanReportData> {
    let companyName = 'Enkap Kullanıcısı';
    try {
      const rows = await this.controlPlane.query<{ company_name: string }[]>(
        `SELECT company_name FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      if (rows[0]) companyName = rows[0].company_name;
    } catch { /* profil bulunamazsa varsayılan kalır */ }

    return {
      companyName,
      tenantId,
      periodStart,
      periodEnd,
      rows: mizan.rows.map((r) => ({
        code:              r.code,
        name:              r.name,
        type:              r.type,
        normalBalance:     r.normalBalance as 'DEBIT' | 'CREDIT',
        totalDebitKurus:   Math.round(r.totalDebit.toDecimal() * 100),
        totalCreditKurus:  Math.round(r.totalCredit.toDecimal() * 100),
        netBalanceKurus:   Math.round(r.netBalance.toDecimal() * 100),
      })),
      totalDebitKurus:   Math.round(mizan.totalDebit.toDecimal() * 100),
      totalCreditKurus:  Math.round(mizan.totalCredit.toDecimal() * 100),
      isBalanced:        mizan.isBalanced,
      generatedAt:       new Date(),
    };
  }
}
