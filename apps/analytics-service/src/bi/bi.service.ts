import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';

import { TenantDataSourceManager } from '@enkap/database';
import { ExcelBuilderService } from '@enkap/reporting';
import { MailerService } from '@enkap/mailer';

import { ReportDefinition, ChartType, ScheduleFormat } from './entities/report-definition.entity';
import { Dashboard } from './entities/dashboard.entity';
import { Widget } from './entities/widget.entity';
import {
  CreateReportDefinitionDto,
  UpdateReportDefinitionDto,
  ExecuteReportDto,
  ScheduleReportDto,
} from './dto/create-report.dto';
import { CreateDashboardDto, UpdateDashboardDto, CreateWidgetDto } from './dto/create-dashboard.dto';

/** Rapor çalıştırma sonucu */
export interface ReportResult {
  columns: string[];
  rows: unknown[][];
  total: number;
  executedAt: Date;
}

/** Paylaşım URL'si yanıtı */
export interface ShareResult {
  shareUrl: string;
}

/**
 * BI (Business Intelligence) Servisi.
 *
 * Sorumluluklar:
 *  - Kullanıcı tanımlı rapor şablonlarını CRUD yönetimi
 *  - Güvenli, izole SQL çalıştırma (SELECT-only, parameterized)
 *  - Cron tabanlı zamanlanmış rapor e-posta gönderimi
 *  - Paylaşım linki (public token) yönetimi
 *  - Dashboard ve widget CRUD yönetimi
 *
 * Güvenlik önlemleri:
 *  1. SQL injection: parameterized query ($N placeholder)
 *  2. DML/DDL engelleme: regex tabanlı SELECT-only doğrulaması
 *  3. Cross-tenant: her sorguda tenant_id filtresi zorunlu
 *  4. İzole çalıştırma: TenantDataSourceManager tenant şemasına kilitli DataSource döndürür
 */
@Injectable()
export class BIService {
  private readonly logger = new Logger(BIService.name);

  /** Tehlikeli SQL keyword'leri — SELECT dışındaki DML/DDL ifadeleri */
  private static readonly DANGEROUS_SQL_PATTERN =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|EXEC|CALL|MERGE)\b/i;

  constructor(
    @InjectRepository(ReportDefinition, 'control_plane')
    private readonly reportRepo: Repository<ReportDefinition>,

    @InjectRepository(Dashboard, 'control_plane')
    private readonly dashboardRepo: Repository<Dashboard>,

    @InjectRepository(Widget, 'control_plane')
    private readonly widgetRepo: Repository<Widget>,

    private readonly tenantDataSourceManager: TenantDataSourceManager,
    private readonly excelBuilder: ExcelBuilderService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Rapor Yönetimi ──────────────────────────────────────────────────────────

  /**
   * Yeni rapor tanımı oluşturur.
   * Sorgu şablonu güvenlik doğrulamasından geçer.
   */
  async createReport(
    dto: CreateReportDefinitionDto,
    tenantId: string,
    userId: string,
  ): Promise<ReportDefinition> {
    // Kaydetmeden önce şablonu doğrula
    this.validateQueryTemplate(dto.query_template);

    const report = this.reportRepo.create({
      tenantId,
      createdBy: userId,
      name:          dto.name,
      description:   dto.description,
      queryTemplate: dto.query_template,
      parameters:    dto.parameters,
      chartType:     dto.chart_type,
      dataSource:    dto.data_source,
    });

    const saved = await this.reportRepo.save(report);
    this.logger.log(`Rapor oluşturuldu: id=${saved.id} tenant=${tenantId}`);
    return saved;
  }

  /**
   * Mevcut rapor tanımını günceller.
   * Tenant ID kontrolü ile cross-tenant değişiklik engellenir.
   */
  async updateReport(
    id: string,
    dto: UpdateReportDefinitionDto,
    tenantId: string,
  ): Promise<ReportDefinition> {
    const report = await this.findReportOrFail(id, tenantId);

    // Sorgu şablonu değişiyorsa yeniden doğrula
    if (dto.query_template) {
      this.validateQueryTemplate(dto.query_template);
      report.queryTemplate = dto.query_template;
    }

    if (dto.name        !== undefined) report.name        = dto.name;
    if (dto.description !== undefined) report.description = dto.description;
    if (dto.parameters  !== undefined) report.parameters  = dto.parameters;
    if (dto.chart_type  !== undefined) report.chartType   = dto.chart_type;
    if (dto.data_source !== undefined) report.dataSource  = dto.data_source;

    return this.reportRepo.save(report);
  }

  /** Raporu siler — tenant izolasyonu zorunlu */
  async deleteReport(id: string, tenantId: string): Promise<void> {
    const report = await this.findReportOrFail(id, tenantId);
    await this.reportRepo.remove(report);
    this.logger.log(`Rapor silindi: id=${id} tenant=${tenantId}`);
  }

  /** Tenant'a ait tüm raporları listeler */
  async listReports(tenantId: string): Promise<ReportDefinition[]> {
    return this.reportRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Tek raporu getirir — tenant izolasyonu zorunlu */
  async getReport(id: string, tenantId: string): Promise<ReportDefinition> {
    return this.findReportOrFail(id, tenantId);
  }

  // ─── Rapor Çalıştırma ────────────────────────────────────────────────────────

  /**
   * Rapor şablonunu parametrelerle çalıştırır.
   *
   * Güvenlik akışı:
   *  1. Raporu tenant_id ile getir (cross-tenant koruması)
   *  2. Sorgu şablonunu doğrula (SELECT-only)
   *  3. Parametreleri $N placeholderlarına dönüştür (SQL injection önlemi)
   *  4. Tenant DataSource üzerinde çalıştır (search_path kilitli)
   *  5. Limit uygula
   */
  async executeReport(
    id: string,
    dto: ExecuteReportDto,
    tenantId: string,
  ): Promise<ReportResult> {
    const report = await this.findReportOrFail(id, tenantId);

    // Güvenlik: şablon hâlâ geçerli mi kontrol et
    this.validateQueryTemplate(report.queryTemplate);

    // Zorunlu parametreler verilmiş mi kontrol et
    const userParams: Record<string, unknown> = dto.parameters ?? {};
    for (const param of report.parameters) {
      if (param.required && userParams[param.name] === undefined) {
        if (param.default === undefined) {
          throw new BadRequestException(
            `Zorunlu parametre eksik: ${param.name}`,
          );
        }
        // Varsayılan değeri uygula
        userParams[param.name] = param.default;
      }
    }

    const limit = dto.limit ?? 1000;

    // :tenantId otomatik enjekte edilir — kullanıcı sağlamak zorunda değil
    const params: Record<string, unknown> = {
      tenantId: tenantId,
      ...userParams,
    };

    // :param_name → $N dönüşümü
    const { sql, values } = this.buildParameterizedQuery(
      report.queryTemplate,
      params,
    );

    // LIMIT ifadesini sorguya ekle (kullanıcı sorgusunu override etme)
    const limitedSql = this.appendLimit(sql, limit);

    // Tenant'a özgü DataSource — search_path kilitli, cross-tenant imkansız
    const dataSource = await this.tenantDataSourceManager.getDataSource(tenantId);

    const startedAt = Date.now();
    const rawRows = await dataSource.query<Record<string, unknown>[]>(limitedSql, values);

    this.logger.log(
      `Rapor çalıştırıldı: id=${id} tenant=${tenantId} ` +
      `rows=${rawRows.length} süresi=${Date.now() - startedAt}ms`,
    );

    // İlk satırdan sütun adlarını çıkar
    const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const rows    = rawRows.map((row) => columns.map((col) => row[col]));

    return {
      columns,
      rows,
      total:       rows.length,
      executedAt:  new Date(),
    };
  }

  // ─── Güvenli SQL Parsing ─────────────────────────────────────────────────────

  /**
   * Sorgu şablonunu güvenlik açısından doğrular.
   * INSERT/UPDATE/DELETE/DDL ifadeleri tespit edilirse hata fırlatır.
   */
  private validateQueryTemplate(sql: string): void {
    if (BIService.DANGEROUS_SQL_PATTERN.test(sql)) {
      throw new BadRequestException(
        'Sorgu şablonunda yalnızca SELECT ifadelerine izin verilir. ' +
        'INSERT, UPDATE, DELETE, DROP, ALTER ve benzeri ifadeler yasaktır.',
      );
    }

    // Sorgunun SELECT ile başladığını doğrula (WITH (CTE) ve açıklama satırları hariç)
    const trimmed = sql.trim().replace(/^(\/\*[\s\S]*?\*\/|--[^\n]*\n)*/m, '').trim();
    const normalized = trimmed.toUpperCase();
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
      throw new BadRequestException(
        'Sorgu şablonu SELECT veya WITH (CTE) ifadesiyle başlamalıdır.',
      );
    }
  }

  /**
   * SQL şablonundaki :param_name placeholderlarını $N sözdizimine dönüştürür.
   * PostgreSQL parameterized query için zorunlu (SQL injection koruması).
   *
   * Örnek:
   *   template: SELECT * FROM invoices WHERE issued_at >= :start AND amount > :min
   *   params:   { start: '2026-01-01', min: 1000 }
   *   sonuç:    SELECT * FROM invoices WHERE issued_at >= $1 AND amount > $2
   *             values: ['2026-01-01', 1000]
   */
  private buildParameterizedQuery(
    template: string,
    params: Record<string, unknown>,
  ): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    const paramIndexMap = new Map<string, number>();

    // :param_name formatını bul — harf/rakam/alt çizgi içerebilir
    const paramPattern = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;

    const sql = template.replace(paramPattern, (_match, paramName: string) => {
      // Aynı parametre adı birden fazla kullanılıyorsa aynı $N'i paylaş
      if (paramIndexMap.has(paramName)) {
        return `$${paramIndexMap.get(paramName)!}`;
      }

      if (!(paramName in params)) {
        throw new BadRequestException(
          `Sorgu şablonunda tanımlı parametre bulunamadı: :${paramName}. ` +
          'Parametre değerini isteğe ekleyin veya şablonu güncelleyin.',
        );
      }

      values.push(params[paramName]);
      const index = values.length;
      paramIndexMap.set(paramName, index);
      return `$${index}`;
    });

    return { sql, values };
  }

  /**
   * Kullanıcı sorgusuna LIMIT ekler.
   * Sorgu zaten LIMIT içeriyorsa daha küçük olan uygulanır.
   */
  private appendLimit(sql: string, limit: number): string {
    // Trailing noktalı virgülü temizle — PostgreSQL birden fazla statement kabul etmez
    const cleanSql = sql.trim().replace(/;\s*$/, '');
    // Basit yaklaşım: sona LIMIT ekle (subquery içindeki LIMITleri etkilemez)
    const existingLimit = cleanSql.match(/\bLIMIT\s+(\d+)\s*$/i);
    if (existingLimit) {
      const existingValue = parseInt(existingLimit[1], 10);
      // Kullanıcı daha az istiyorsa koru
      if (existingValue <= limit) return cleanSql;
      // Güvenli: büyük LIMIT değerini bizimkiyle değiştir
      return cleanSql.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${limit}`);
    }
    return `${cleanSql} LIMIT ${limit}`;
  }

  // ─── Zamanlama ───────────────────────────────────────────────────────────────

  /**
   * Rapor zamanlaması ayarlar.
   * Cron ifadesi ve e-posta adresi rapor kaydına yazılır.
   */
  async scheduleReport(
    id: string,
    dto: ScheduleReportDto,
    tenantId: string,
  ): Promise<ReportDefinition> {
    const report = await this.findReportOrFail(id, tenantId);

    report.scheduleCron   = dto.cron;
    report.scheduleEmail  = dto.email;
    report.scheduleFormat = dto.format as ScheduleFormat;

    const saved = await this.reportRepo.save(report);
    this.logger.log(`Rapor zamanlandı: id=${id} cron=${dto.cron} tenant=${tenantId}`);
    return saved;
  }

  /** Rapor zamanlamasını kaldırır */
  async unscheduleReport(id: string, tenantId: string): Promise<ReportDefinition> {
    const report = await this.findReportOrFail(id, tenantId);

    report.scheduleCron   = undefined;
    report.scheduleEmail  = undefined;
    report.scheduleFormat = undefined;

    const saved = await this.reportRepo.save(report);
    this.logger.log(`Rapor zamanlaması kaldırıldı: id=${id} tenant=${tenantId}`);
    return saved;
  }

  /**
   * Her saat başında çalışır — zamanı gelen raporları çalıştırır ve gönderir.
   *
   * Cron: "0 * * * *" (her saat başı)
   *
   * Akış:
   *  1. schedule_cron dolu olan tüm raporları getir
   *  2. Cron ifadesini şu anki saate göre eşleştir
   *  3. Eşleşen raporları çalıştır
   *  4. Sonucu PDF veya Excel'e dönüştür
   *  5. E-posta ile gönder
   *  6. last_run_at güncelle
   *
   * Hata toleransı: tek bir rapor başarısız olursa diğerleri etkilenmez.
   */
  @Cron('0 * * * *')
  async runScheduledReports(): Promise<void> {
    // Zamanlanmış tüm raporları getir
    const scheduledReports = await this.reportRepo
      .createQueryBuilder('report')
      .where('report.schedule_cron IS NOT NULL')
      .andWhere('report.schedule_email IS NOT NULL')
      .getMany();

    if (scheduledReports.length === 0) return;

    const now = new Date();
    this.logger.log(
      `Zamanlanmış rapor kontrolü: ${scheduledReports.length} rapor bulundu`,
    );

    // Her raporu bağımsız işle — bir hatanın diğerlerini engellememesi için
    await Promise.allSettled(
      scheduledReports.map((report) =>
        this.processScheduledReport(report, now).catch((err: Error) => {
          this.logger.warn(
            `Zamanlanmış rapor başarısız: id=${report.id} hata=${err.message}`,
          );
        }),
      ),
    );
  }

  /** Tek bir zamanlanmış raporu işler */
  private async processScheduledReport(
    report: ReportDefinition,
    now: Date,
  ): Promise<void> {
    // Basit cron eşleştirme — saat ve dakika kontrolü
    if (!this.isCronDue(report.scheduleCron!, now)) return;

    this.logger.log(
      `Zamanlanmış rapor çalıştırılıyor: id=${report.id} tenant=${report.tenantId}`,
    );

    // Raporu varsayılan parametrelerle çalıştır
    const result = await this.executeReport(
      report.id,
      { parameters: {}, limit: 10000 },
      report.tenantId,
    );

    // Format seçimine göre dosya üret
    let attachment: { filename: string; content: Buffer; contentType: string } | undefined;

    if (report.scheduleFormat === ScheduleFormat.EXCEL) {
      const buffer = await this.buildExcelFromResult(result, report.name);
      attachment = {
        filename:    `${report.name}-${this.formatDateFilename(now)}.xlsx`,
        content:     buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      // PDF formatı — basit tablo PDF oluştur
      const buffer = await this.buildPdfFromResult(result, report.name);
      attachment = {
        filename:    `${report.name}-${this.formatDateFilename(now)}.pdf`,
        content:     buffer,
        contentType: 'application/pdf',
      };
    }

    // E-posta gönder — fire-and-forget değil, hata loglanır ama fırlatılmaz
    await this.mailerService.send({
      to:      report.scheduleEmail!,
      subject: `[Enkap BI] Zamanlanmış Rapor: ${report.name}`,
      html: `
        <h2>${report.name}</h2>
        <p>Zamanlanmış raporunuz hazırlanmıştır.</p>
        <p>Toplam kayıt: <strong>${result.total}</strong></p>
        <p>Oluşturulma: ${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR')}</p>
      `,
      text: `${report.name} raporu ekte sunulmuştur. Toplam kayıt: ${result.total}`,
      attachments: [attachment],
    }).catch((err: Error) => {
      this.logger.warn(
        `Zamanlanmış rapor e-postası gönderilemedi: id=${report.id} hata=${err.message}`,
      );
    });

    // Son çalıştırma zamanını güncelle
    await this.reportRepo.update(report.id, { lastRunAt: now });
  }

  /**
   * Cron ifadesinin belirtilen zamanda çalışıp çalışmayacağını kontrol eder.
   * Basit 5-alan cron formatı: dakika saat gün ay haftaGünü
   *
   * Tam cron kütüphanesi (cronstrue, cron-parser) yerine hafif implementasyon.
   * Yalnızca sayısal değerler ve "*" desteklenir.
   */
  private isCronDue(cronExpression: string, now: Date): boolean {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const matchField = (field: string, value: number): boolean => {
      if (field === '*') return true;
      const num = parseInt(field, 10);
      return !isNaN(num) && num === value;
    };

    return (
      matchField(minute,     now.getMinutes()) &&
      matchField(hour,       now.getHours())   &&
      matchField(dayOfMonth, now.getDate())     &&
      matchField(month,      now.getMonth() + 1) &&
      matchField(dayOfWeek,  now.getDay())
    );
  }

  // ─── Paylaşım ────────────────────────────────────────────────────────────────

  /**
   * Rapor için herkese açık paylaşım token'ı üretir.
   * Token bir kez üretilir — yenilemek için tekrar çağrılır.
   */
  async shareReport(id: string, tenantId: string): Promise<ShareResult> {
    const report = await this.findReportOrFail(id, tenantId);

    // Yeni token üret
    report.shareToken = crypto.randomUUID();
    report.isPublic   = true;

    await this.reportRepo.save(report);

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.enkap.com.tr',
    );

    const shareUrl = `${frontendUrl}/bi/shared/${report.shareToken}`;
    this.logger.log(`Rapor paylaşıma açıldı: id=${id} token=${report.shareToken}`);

    return { shareUrl };
  }

  /**
   * Paylaşım token'ı ile herkese açık raporu getirir.
   * is_public = false ise 404 döndürülür (token bilgisi sızdırılmaz).
   */
  async getSharedReport(
    shareToken: string,
  ): Promise<{ reportDef: ReportDefinition; lastResult: ReportResult }> {
    const report = await this.reportRepo.findOne({
      where: { shareToken, isPublic: true },
    });

    if (!report) {
      // Güvenlik: token var ama public değil durumunda bilgi sızdırma
      throw new NotFoundException('Paylaşılan rapor bulunamadı veya erişim kapalı.');
    }

    // Varsayılan parametrelerle son sonucu çalıştır
    const lastResult = await this.executeReport(
      report.id,
      { parameters: {}, limit: 1000 },
      report.tenantId,
    );

    return { reportDef: report, lastResult };
  }

  // ─── Dashboard Yönetimi ───────────────────────────────────────────────────────

  /**
   * Yeni dashboard oluşturur.
   * is_default = true ise mevcut varsayılan dashboard'un is_default değeri false yapılır.
   */
  async createDashboard(
    dto: CreateDashboardDto,
    tenantId: string,
    userId: string,
  ): Promise<Dashboard> {
    // Varsayılan olarak işaretleniyorsa mevcut varsayılanı kaldır
    if (dto.is_default) {
      await this.dashboardRepo.update(
        { tenantId, isDefault: true },
        { isDefault: false },
      );
    }

    const dashboard = this.dashboardRepo.create({
      tenantId,
      createdBy:   userId,
      name:        dto.name,
      description: dto.description,
      layout:      { lg: dto.layout, md: dto.layout },
      isDefault:   dto.is_default ?? false,
    });

    const saved = await this.dashboardRepo.save(dashboard);
    this.logger.log(`Dashboard oluşturuldu: id=${saved.id} tenant=${tenantId}`);
    return saved;
  }

  /** Tenant'a ait tüm dashboard'ları listeler */
  async listDashboards(tenantId: string): Promise<Dashboard[]> {
    return this.dashboardRepo.find({
      where: { tenantId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /** Tek dashboard'u widgetları ile birlikte getirir */
  async getDashboard(id: string, tenantId: string): Promise<Dashboard> {
    const dashboard = await this.dashboardRepo.findOne({
      where: { id, tenantId },
      relations: ['widgets'],
      order: { widgets: { position: 'ASC' } },
    });

    if (!dashboard) {
      throw new NotFoundException(`Dashboard bulunamadı: id=${id}`);
    }

    return dashboard;
  }

  /**
   * Dashboard günceller.
   * is_default = true geçilirse diğer dashboard'ların varsayılan işareti kaldırılır.
   */
  async updateDashboard(
    id: string,
    dto: UpdateDashboardDto,
    tenantId: string,
  ): Promise<Dashboard> {
    const dashboard = await this.findDashboardOrFail(id, tenantId);

    if (dto.is_default === true && !dashboard.isDefault) {
      // Mevcut varsayılanı temizle
      await this.dashboardRepo.update(
        { tenantId, isDefault: true },
        { isDefault: false },
      );
    }

    if (dto.name        !== undefined) dashboard.name        = dto.name;
    if (dto.description !== undefined) dashboard.description = dto.description;
    if (dto.is_default  !== undefined) dashboard.isDefault   = dto.is_default;
    if (dto.layout      !== undefined) {
      dashboard.layout = { lg: dto.layout, md: dto.layout };
    }

    return this.dashboardRepo.save(dashboard);
  }

  /** Dashboard'u siler — cascade ile widgetlar da silinir */
  async deleteDashboard(id: string, tenantId: string): Promise<void> {
    const dashboard = await this.findDashboardOrFail(id, tenantId);
    await this.dashboardRepo.remove(dashboard);
    this.logger.log(`Dashboard silindi: id=${id} tenant=${tenantId}`);
  }

  // ─── Widget Yönetimi ─────────────────────────────────────────────────────────

  /**
   * Dashboard'a widget ekler.
   * Bağlı rapor tanımı verilmişse tenant izolasyonu doğrulanır.
   */
  async addWidget(
    dashboardId: string,
    dto: CreateWidgetDto,
    tenantId: string,
  ): Promise<Widget> {
    // Dashboard'un bu tenant'a ait olduğunu doğrula
    await this.findDashboardOrFail(dashboardId, tenantId);

    // Rapor tanımı verildiyse bu tenant'a ait mi kontrol et
    if (dto.report_definition_id) {
      await this.findReportOrFail(dto.report_definition_id, tenantId);
    }

    const widget = this.widgetRepo.create({
      dashboardId,
      tenantId,
      title:                   dto.title,
      reportDefinitionId:      dto.report_definition_id,
      chartType:               dto.chart_type,
      defaultParameters:       dto.default_parameters ?? {},
      refreshIntervalSeconds:  dto.refresh_interval_seconds,
      position:                dto.position,
    });

    const saved = await this.widgetRepo.save(widget);
    this.logger.log(
      `Widget eklendi: id=${saved.id} dashboard=${dashboardId} tenant=${tenantId}`,
    );
    return saved;
  }

  /** Widget kaldırır — tenant izolasyonu zorunlu */
  async removeWidget(widgetId: string, tenantId: string): Promise<void> {
    const widget = await this.widgetRepo.findOne({
      where: { id: widgetId, tenantId },
    });

    if (!widget) {
      throw new NotFoundException(`Widget bulunamadı: id=${widgetId}`);
    }

    await this.widgetRepo.remove(widget);
    this.logger.log(`Widget kaldırıldı: id=${widgetId} tenant=${tenantId}`);
  }

  // ─── Yardımcı Metodlar ────────────────────────────────────────────────────────

  /**
   * Raporu tenant_id ile getirir — bulunamazsa NotFoundException fırlatır.
   * Tüm rapor erişiminde bu method kullanılmalı (cross-tenant koruması).
   */
  private async findReportOrFail(
    id: string,
    tenantId: string,
  ): Promise<ReportDefinition> {
    const report = await this.reportRepo.findOne({ where: { id, tenantId } });
    if (!report) {
      throw new NotFoundException(`Rapor bulunamadı: id=${id}`);
    }
    return report;
  }

  /** Dashboard'u tenant_id ile getirir — bulunamazsa NotFoundException fırlatır */
  private async findDashboardOrFail(
    id: string,
    tenantId: string,
  ): Promise<Dashboard> {
    const dashboard = await this.dashboardRepo.findOne({ where: { id, tenantId } });
    if (!dashboard) {
      throw new NotFoundException(`Dashboard bulunamadı: id=${id}`);
    }
    return dashboard;
  }

  /**
   * Rapor sonucundan Excel dosyası üretir.
   * Genel amaçlı tablo formatı — domain spesifik şablon kullanılmaz.
   */
  private async buildExcelFromResult(
    result: ReportResult,
    reportName: string,
  ): Promise<Buffer> {
    // ExcelBuilderService spesifik metodları yerine genel tablo yaklaşımı
    // Dinamik sütunlar için doğrudan ExcelJS kullanılması gerekir
    // TODO: ExcelBuilderService'e genel tablo metodu eklendiğinde burası güncellenecek
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Enkap BI';
    wb.modified = new Date();
    wb.title    = reportName;

    const ws = wb.addWorksheet(reportName.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Sütun başlıklarını ayarla
    ws.columns = result.columns.map((col) => ({
      header: col,
      key:    col,
      width:  Math.max(col.length + 4, 14),
    }));

    // Başlık satırını stillendir
    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell: import('exceljs').Cell) => {
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a56db' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Veri satırlarını ekle
    for (const row of result.rows) {
      const rowData: Record<string, unknown> = {};
      result.columns.forEach((col, idx) => {
        rowData[col] = row[idx];
      });
      ws.addRow(rowData);
    }

    // Alternatif satır rengi
    for (let i = 2; i <= result.rows.length + 1; i++) {
      if (i % 2 === 0) {
        ws.getRow(i).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' },
        };
      }
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Rapor sonucundan basit tablo PDF'i üretir.
   * PDFKit ile dinamik sütunlu tablo oluşturur.
   */
  private async buildPdfFromResult(
    result: ReportResult,
    reportName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const PDFDocument = require('pdfkit') as typeof import('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Başlık
      doc.font('Helvetica-Bold').fontSize(16).text(reportName, { align: 'center' });
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(9).text(
        `Oluşturulma: ${new Date().toLocaleDateString('tr-TR')}  |  Toplam kayıt: ${result.total}`,
        { align: 'center' },
      );
      doc.moveDown(1);

      // Tablo — dinamik sütun genişliği
      const pageWidth   = doc.page.width - 80;
      const colWidth    = result.columns.length > 0
        ? Math.floor(pageWidth / result.columns.length)
        : pageWidth;
      let   y           = doc.y;
      const rowHeight   = 18;

      // Başlık satırı
      doc.rect(40, y, pageWidth, rowHeight).fill('#1a56db');
      result.columns.forEach((col, idx) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#ffffff')
          .text(col, 40 + idx * colWidth, y + 4, { width: colWidth - 4, ellipsis: true });
      });
      y += rowHeight;

      // Veri satırları
      result.rows.slice(0, 500).forEach((row, rowIdx) => {
        // Sayfa sonu kontrolü
        if (y + rowHeight > doc.page.height - 60) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
          y = 40;
        }

        // Alternatif satır arka planı
        if (rowIdx % 2 === 0) {
          doc.rect(40, y, pageWidth, rowHeight).fill('#F3F4F6');
        }

        row.forEach((cell, idx) => {
          const cellStr = cell === null || cell === undefined
            ? ''
            : String(cell);
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#111827')
            .text(cellStr, 40 + idx * colWidth, y + 4, {
              width:    colWidth - 4,
              ellipsis: true,
            });
        });
        y += rowHeight;
      });

      if (result.rows.length > 500) {
        doc.moveDown(0.5);
        doc
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor('#6B7280')
          .text(`Not: PDF'te ilk 500 satır gösterilmektedir. Tüm veri için Excel formatını kullanın.`);
      }

      doc.end();
    });
  }

  /** Dosya adı için tarih formatı: YYYYMMDD-HHmm */
  private formatDateFilename(date: Date): string {
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `-${pad(date.getHours())}${pad(date.getMinutes())}`
    );
  }
}
