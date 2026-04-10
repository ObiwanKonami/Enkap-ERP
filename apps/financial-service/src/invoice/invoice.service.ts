import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export interface BulkCreateResult {
  index:      number;
  success:    boolean;
  invoiceId?: string;
  invoiceNo?: string;
  error?:     string;
}
import { EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import type { InvoiceStatus } from '@enkap/shared-types';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { KdvEngine } from '../kdv/kdv.engine';
import { PoMatchService } from './po-match.service';
import { Money } from '../shared/money';
import type {
  CreateInvoiceDto,
  CreateInvoiceFromOrderDto,
  ApproveInvoiceDto,
  CancelInvoiceDto,
} from './dto/create-invoice.dto';

/**
 * Fatura iş mantığı servisi.
 *
 * Sorumluluklar:
 *  - Fatura oluşturma (KDV otomatik hesaplanır)
 *  - Onay akışı: DRAFT → PENDING_GIB → ACCEPTED_GIB
 *  - İptal: sadece DRAFT ve REJECTED_GIB durumunda
 *  - Fatura onaylanınca otomatik yevmiye kaydı
 *  - Numaralandırma: {YIL}{AY}-{SIRA} formatı
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
    private readonly kdvEngine: KdvEngine,
    private readonly poMatchService: PoMatchService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const { tenantId, userId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    this.validateCreateDto(dto);

    return dataSource.transaction(async (manager) => {
      const invoiceRepo = manager.getRepository(Invoice);
      const lineRepo = manager.getRepository(InvoiceLine);

      // Benzersiz fatura numarası üret
      const invoiceNumber = await this.generateInvoiceNumber(
        invoiceRepo,
        tenantId,
        dto.direction,
      );

      // GİB UUID — e-Fatura ve e-Arşiv için zorunlu
      const gibUuid =
        dto.invoiceType === 'E_FATURA' || dto.invoiceType === 'E_ARSIV'
          ? randomUUID()
          : undefined;

      // Fatura başlığını kaydet
      const invoice = invoiceRepo.create({
        tenantId,
        gibUuid,
        invoiceNumber,
        invoiceType: dto.invoiceType,
        direction: dto.direction,
        status: 'DRAFT',
        counterpartyId: dto.customerId ?? dto.vendorId,
        customerId: dto.customerId,
        vendorId: dto.vendorId,
        issueDate: new Date(dto.issueDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currency: dto.currency,
        exchangeRate: dto.exchangeRate,
        notes: dto.notes,
        createdBy: userId,
        subtotal: 0,
        kdvTotal: 0,
        discountTotal: 0,
        total: 0,
      });

      const savedInvoice = await invoiceRepo.save(invoice);

      // Satırları hesapla ve kaydet
      let totalSubtotal = Money.zero();
      let totalKdv = Money.zero();
      let totalDiscount = Money.zero();

      const lines: InvoiceLine[] = [];

      for (let i = 0; i < dto.lines.length; i++) {
        const lineDto = dto.lines[i]!;
        const lineNumber = i + 1;

        const grossAmount = Money.of(lineDto.quantity * lineDto.unitPrice);
        const discountAmount = grossAmount.percentage(lineDto.discountPct);
        const matrah = grossAmount.subtract(discountAmount);
        const kdvResult = this.kdvEngine.calculate({
          matrah,
          rate: lineDto.kdvRate,
        });
        const lineTotal = matrah.add(kdvResult.kdvAmount);

        totalSubtotal = totalSubtotal.add(matrah);
        totalKdv = totalKdv.add(kdvResult.kdvAmount);
        totalDiscount = totalDiscount.add(discountAmount);

        lines.push(
          lineRepo.create({
            tenantId,
            invoiceId: savedInvoice.id,
            lineNumber,
            productId: lineDto.productId,
            description: lineDto.description,
            quantity: lineDto.quantity,
            unit: lineDto.unit,
            unitPrice: lineDto.unitPrice,
            discountPct: lineDto.discountPct,
            kdvRate: lineDto.kdvRate,
            kdvAmount: kdvResult.kdvAmount.toDecimal(),
            lineTotal: lineTotal.toDecimal(),
          }),
        );
      }

      await lineRepo.save(lines);

      // Fatura toplamlarını güncelle
      const total = totalSubtotal.add(totalKdv);
      await invoiceRepo.update(savedInvoice.id, {
        subtotal: totalSubtotal.toDecimal(),
        kdvTotal: totalKdv.toDecimal(),
        discountTotal: totalDiscount.toDecimal(),
        total: total.toDecimal(),
      });

      savedInvoice.subtotal = totalSubtotal.toDecimal();
      savedInvoice.kdvTotal = totalKdv.toDecimal();
      savedInvoice.discountTotal = totalDiscount.toDecimal();
      savedInvoice.total = total.toDecimal();

      this.logger.log(
        `Fatura oluşturuldu: ${invoiceNumber} ` +
        `tenant=${tenantId} toplam=${total.toDisplayString()}`,
      );

      return savedInvoice;
    });
  }

  /**
   * Satış siparişinden otomatik OUT fatura oluştur.
   *
   * Akış:
   *  1. order-service'ten sipariş detaylarını HTTP ile çek
   *  2. Sipariş satırlarını fatura satırlarına dönüştür (kuruş → TL)
   *  3. DRAFT fatura oluştur
   *  4. sendToGib=true ise otomatik onayla
   */
  async createFromOrder(dto: CreateInvoiceFromOrderDto): Promise<Invoice> {
    const { tenantId, userId } = getTenantContext();

    // order-service'ten sipariş bilgisini çek
    const orderUrl = this.config.get<string>('ORDER_SERVICE_URL', 'http://localhost:3012');
    let orderData: {
      id: string;
      soNumber: string;
      customerId: string | null;
      orderDate: string;
      status: string;
      totalKurus: number;
      kdvKurus: number;
      lines: Array<{
        productId: string | null;
        productName: string;
        quantity: number;
        unitCode: string;
        unitPriceKurus: number;
        discountRate: number;
        kdvRate: number;
        lineTotalKurus: number;
      }>;
    };

    try {
      const resp = await firstValueFrom(
        this.httpService.get(`${orderUrl}/api/v1/orders/${dto.salesOrderId}`, {
          headers: {
            'x-tenant-id': tenantId,
            'x-user-id': userId,
          },
        }),
      );
      orderData = resp.data;
    } catch (err) {
      throw new BadRequestException(
        `Sipariş bilgisi alınamadı: ${dto.salesOrderId} — ${String(err)}`,
      );
    }

    if (!orderData.lines?.length) {
      throw new BadRequestException(`Sipariş satırı bulunamadı: ${dto.salesOrderId}`);
    }

    // Sipariş confirmed+ durumda olmalı
    const invoiceableStatuses = ['confirmed', 'processing', 'shipped', 'delivered'];
    if (!invoiceableStatuses.includes(orderData.status)) {
      throw new BadRequestException(
        `Bu sipariş için fatura kesilemez. Durum: ${orderData.status}`,
      );
    }

    // Aynı siparişten mükerrer fatura kontrolü
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    const existingInvoice = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM invoices
       WHERE tenant_id = $1 AND sales_order_id = $2 AND status != 'CANCELLED'
       LIMIT 1`,
      [tenantId, dto.salesOrderId],
    );
    if (existingInvoice.length > 0) {
      throw new ConflictException(
        `Bu sipariş için zaten fatura mevcut: ${existingInvoice[0]!.id}`,
      );
    }

    // Sipariş satırlarını CreateInvoiceDto formatına dönüştür
    const createDto: CreateInvoiceDto = {
      invoiceType: 'E_FATURA',
      direction: 'OUT',
      customerId: orderData.customerId ?? undefined,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: dto.dueDate,
      currency: 'TRY',
      exchangeRate: 1,
      notes: dto.notes ?? `Satış siparişinden oluşturuldu: ${orderData.soNumber}`,
      lines: orderData.lines.map((line) => ({
        productId: line.productId ?? undefined,
        description: line.productName,
        quantity: line.quantity,
        unit: line.unitCode === 'ADET' ? 'adet' : line.unitCode,
        unitPrice: line.unitPriceKurus / 100, // kuruş → TL
        discountPct: Number(line.discountRate) || 0,
        kdvRate: Number(line.kdvRate) as 0 | 1 | 10 | 20,
      })),
    };

    // Fatura oluştur (mevcut create akışını kullan)
    const invoice = await this.create(createDto);

    // sales_order_id referansını yaz
    await dataSource.query(
      `UPDATE invoices SET sales_order_id = $1 WHERE id = $2 AND tenant_id = $3`,
      [dto.salesOrderId, invoice.id, tenantId],
    );

    this.logger.log(
      `Siparişten fatura oluşturuldu: sipariş=${orderData.soNumber} ` +
      `fatura=${invoice.invoiceNumber} tenant=${tenantId}`,
    );

    // sendToGib aktifse otomatik onayla
    if (dto.sendToGib) {
      return this.approve({ invoiceId: invoice.id, sendToGib: true });
    }

    return invoice;
  }

  async findAll(filters: {
    status?: InvoiceStatus;
    direction?: 'OUT' | 'IN';
    counterpartyId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: Invoice[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    const repo = dataSource.getRepository(Invoice);

    const qb = repo
      .createQueryBuilder('invoice')
      .where('invoice.tenant_id = :tenantId', { tenantId })
      .orderBy('invoice.created_at', 'DESC');

    if (filters.search) {
      qb.andWhere('invoice.invoice_number ILIKE :search', { search: `%${filters.search}%` });
    }
    if (filters.status) {
      qb.andWhere('invoice.status = :status', { status: filters.status });
    }
    if (filters.direction) {
      qb.andWhere('invoice.direction = :direction', { direction: filters.direction });
    }
    if (filters.counterpartyId) {
      qb.andWhere(
        '(invoice.counterparty_id = :cpId OR invoice.customer_id = :cpId OR invoice.vendor_id = :cpId)',
        { cpId: filters.counterpartyId },
      );
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();

    // Karşı taraf adlarını crm_contacts'tan tek sorguda getir
    const counterpartyIds = [
      ...new Set(
        items.flatMap(i => [i.counterpartyId, i.customerId, i.vendorId].filter(Boolean) as string[]),
      ),
    ];

    const nameMap = new Map<string, string>();

    if (counterpartyIds.length) {
      const rows = await dataSource.query<{ id: string; name: string }[]>(
        `SELECT id,
                COALESCE(company_name, first_name || COALESCE(' ' || last_name, '')) AS name
         FROM crm_contacts WHERE id = ANY($1)`,
        [counterpartyIds],
      );
      for (const r of rows) nameMap.set(r.id, (r.name ?? '').trim());
    }

    const enriched = items.map(inv => {
      const cpId = inv.counterpartyId ?? inv.customerId ?? inv.vendorId;
      return {
        ...inv,
        counterpartyName: cpId ? (nameMap.get(cpId) ?? undefined) : undefined,
      };
    });

    return { items: enriched as unknown as Invoice[], total, page, limit };
  }

  async findOne(invoiceId: string): Promise<Invoice & { counterpartyName?: string }> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    const invoice = await dataSource.getRepository(Invoice).findOne({
      where: { id: invoiceId, tenantId },
      relations: ['lines'],
    });

    if (!invoice) {
      throw new NotFoundException(`Fatura bulunamadı: ${invoiceId}`);
    }

    // Karşı taraf adını çöz
    const cpId = (invoice as unknown as Record<string, unknown>)['counterpartyId'] as string | undefined
               ?? invoice.customerId
               ?? invoice.vendorId;

    let counterpartyName: string | undefined;
    if (cpId) {
      const rows = await dataSource.query<{ name: string }[]>(
        `SELECT COALESCE(company_name, first_name || COALESCE(' ' || last_name, '')) AS name
         FROM crm_contacts WHERE id = $1 LIMIT 1`,
        [cpId],
      );
      if (rows[0]?.name) counterpartyName = rows[0].name.trim();
    }

    return { ...invoice, counterpartyName };
  }

  // ─── Toplu oluşturma ───────────────────────────────────────────────────────

  /**
   * Toplu fatura oluşturma (max 100 adet).
   *
   * Her fatura bağımsız transaction içinde işlenir.
   * Hata olan satır kaydedilir, diğerleri devam eder.
   *
   * @returns Her bir öğe için başarı/hata sonucu
   */
  async bulkCreate(items: CreateInvoiceDto[]): Promise<BulkCreateResult[]> {
    if (items.length > 100) {
      throw new BadRequestException('Toplu oluşturmada maksimum 100 fatura gönderilebilir.');
    }

    const results: BulkCreateResult[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const invoice = await this.create(items[i]!);
        results.push({ index: i, success: true, invoiceId: invoice.id, invoiceNo: invoice.invoiceNumber });
      } catch (err) {
        results.push({
          index:   i,
          success: false,
          error:   err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  // ─── Onay akışı ────────────────────────────────────────────────────────────

  /**
   * Faturayı onaylar.
   *
   * DRAFT → PENDING_GIB (sendToGib=true) veya ACCEPTED_GIB (sendToGib=false)
   *
   * Onay sonrası:
   *  1. Otomatik yevmiye kaydı oluşturulur (120/600 hesapları)
   *  2. sendToGib=true ise GİB gönderim kuyruğuna eklenir
   */
  async approve(dto: ApproveInvoiceDto): Promise<Invoice> {
    const { tenantId } = getTenantContext();
    const newStatus: InvoiceStatus = dto.sendToGib ? 'PENDING_GIB' : 'ACCEPTED_GIB';
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    // Atomik UPDATE: TOCTOU race condition'ını önlemek için durum kontrolü ve
    // güncelleme tek sorguda yapılır. Başka bir istek aynı anda onaylarsa
    // UPDATE 0 satır döner → ConflictException fırlatılır.
    const updated = await dataSource.query<{ id: string; invoice_number: string }[]>(
      `UPDATE invoices
          SET status = $1
        WHERE id = $2 AND tenant_id = $3 AND status = 'DRAFT'
        RETURNING id, invoice_number`,
      [newStatus, dto.invoiceId, tenantId],
    );

    if (!updated.length) {
      // Fatura yoksa NotFoundException, zaten onaylandıysa ConflictException
      const exists = await dataSource.query<{ status: string }[]>(
        `SELECT status FROM invoices WHERE id = $1 AND tenant_id = $2`,
        [dto.invoiceId, tenantId],
      );
      if (!exists.length) {
        throw new NotFoundException(`Fatura bulunamadı: ${dto.invoiceId}`);
      }
      throw new ConflictException(
        `Yalnızca taslak faturalar onaylanabilir. Mevcut durum: ${exists[0]!.status}`,
      );
    }

    // Yevmiye kaydı için tam fatura nesnesini yükle
    const invoice = await this.findOne(dto.invoiceId);

    await dataSource.transaction(async (manager) => {
      await this.createJournalEntry(manager, invoice, tenantId);

      // Fatura onaylandığında otomatik ödeme planı oluştur
      // IN (alış) → AP ödeme planı, OUT (satış) → AR tahsilat planı
      await this.createAutoPaymentPlan(manager, invoice, tenantId);
    });

    invoice.status = newStatus;

    // Gelen fatura onayında PO eşleştirme (fire-and-forget)
    if (invoice.direction === 'IN') {
      this.poMatchService.matchInvoiceToPo(dto.invoiceId, tenantId).catch((err) => {
        this.logger.warn(`PO eşleştirme hatası: fatura=${dto.invoiceId} hata=${String(err)}`);
      });
    }

    this.logger.log(
      `Fatura onaylandı: ${invoice.invoiceNumber} ` +
      `durum=${newStatus} tenant=${tenantId}`,
    );

    return invoice;
  }

  /**
   * Faturayı iptal eder.
   * Yalnızca DRAFT ve REJECTED_GIB durumlarında mümkün.
   */
  async cancel(dto: CancelInvoiceDto): Promise<Invoice> {
    const { tenantId } = getTenantContext();
    const invoice = await this.findOne(dto.invoiceId);

    const cancellableStatuses: InvoiceStatus[] = ['DRAFT', 'REJECTED_GIB'];
    if (!cancellableStatuses.includes(invoice.status)) {
      throw new BadRequestException(
        `Bu durumda fatura iptal edilemez: ${invoice.status}. ` +
        `GİB'e gönderilmiş faturalar için iade faturası düzenlenmelidir.`,
      );
    }

    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    await dataSource.getRepository(Invoice).update(invoice.id, {
      status: 'CANCELLED',
      notes: `${invoice.notes ?? ''}\n[İPTAL] ${dto.reason}`.trim(),
    });

    invoice.status = 'CANCELLED';
    return invoice;
  }

  // ─── GİB durum güncelleme (GibSubmissionService tarafından çağrılır) ───────

  async updateGibStatus(
    invoiceId: string,
    tenantId: string,
    status: 'ACCEPTED_GIB' | 'REJECTED_GIB',
    gibResponse: Record<string, unknown>,
  ): Promise<void> {
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    await dataSource.query(
      `UPDATE invoices SET status = $1, gib_response = $2::jsonb WHERE id = $3 AND tenant_id = $4`,
      [status, JSON.stringify(gibResponse), invoiceId, tenantId],
    );
  }

  // ─── Özel yardımcı metodlar ─────────────────────────────────────────────────

  private async generateInvoiceNumber(
    repo: Repository<Invoice>,
    tenantId: string,
    direction: 'OUT' | 'IN',
  ): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = direction === 'OUT' ? 'SAT' : 'ALI';

    // Aynı ay/yıl/yön için en yüksek sıra numarasını bul
    const latest = await repo
      .createQueryBuilder('inv')
      .select('inv.invoice_number', 'num')
      .where('inv.tenant_id = :tenantId', { tenantId })
      .andWhere('inv.direction = :direction', { direction })
      .andWhere("inv.invoice_number LIKE :pattern", {
        pattern: `${prefix}${year}${month}-%`,
      })
      .orderBy('inv.invoice_number', 'DESC')
      .limit(1)
      .getRawOne<{ num: string }>();

    let sequence = 1;
    if (latest?.num) {
      const parts = latest.num.split('-');
      sequence = parseInt(parts[parts.length - 1] ?? '0', 10) + 1;
    }

    return `${prefix}${year}${month}-${String(sequence).padStart(5, '0')}`;
  }

  /**
   * Fatura onayında otomatik yevmiye kaydı.
   *
   * Satış faturası (OUT):
   *   BORÇ  120 Alıcılar          → toplam (KDV dahil)
   *   ALACAK 600 Yurt İçi Satışlar → subtotal
   *   ALACAK 391 Hesaplanan KDV   → kdvTotal
   *
   * Alış faturası (IN):
   *   BORÇ  153 Ticari Mallar     → subtotal
   *   BORÇ  191 İndirilecek KDV  → kdvTotal
   *   ALACAK 320 Satıcılar        → toplam
   */
  private async createJournalEntry(
    manager: EntityManager,
    invoice: Invoice,
    tenantId: string,
  ): Promise<void> {
    const entryNumber = `YEV-${invoice.invoiceNumber}`;

    // INSERT...RETURNING: tek atomik sorguda kaydet ve id'yi al.
    // Ayrı SELECT kullanmak, concurrent insert durumunda yanlış id dönebilir.
    const [entryRow] = await manager.query<{ id: string }[]>(
      `INSERT INTO journal_entries
         (id, tenant_id, entry_number, entry_date, description,
          reference_type, reference_id, is_posted, posted_at, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'INVOICE', $5, true, NOW(), $6)
       RETURNING id`,
      [
        tenantId,
        entryNumber,
        invoice.issueDate,
        `Fatura: ${invoice.invoiceNumber}`,
        invoice.id,
        invoice.createdBy,
      ],
    );

    const entryId = entryRow?.id;
    if (!entryId) {
      throw new Error(`Yevmiye kaydı oluşturulamadı: ${invoice.invoiceNumber}`);
    }

    const lines =
      invoice.direction === 'OUT'
        ? [
            { account: '120', debit: invoice.total,    credit: 0 },
            { account: '600', debit: 0,                credit: invoice.subtotal },
            { account: '391', debit: 0,                credit: invoice.kdvTotal },
          ]
        : [
            { account: '153', debit: invoice.subtotal, credit: 0 },
            { account: '191', debit: invoice.kdvTotal, credit: 0 },
            { account: '320', debit: 0,                credit: invoice.total },
          ];

    for (const line of lines) {
      if (line.debit === 0 && line.credit === 0) continue;

      await manager.query(
        `INSERT INTO journal_entry_lines
           (id, tenant_id, entry_id, account_code, description, debit_amount, credit_amount)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          entryId,
          line.account,
          `Fatura: ${invoice.invoiceNumber}`,
          line.debit,
          line.credit,
        ],
      );
    }
  }

  /**
   * Gelen (IN) fatura onayında otomatik AP ödeme planı oluşturur.
   *
   * Tek taksit: dueDate = fatura.dueDate (yoksa issueDate + 30 gün), amount = total.
   * Idempotent: aynı fatura için plan zaten varsa sessizce atlar.
   */
  private async createAutoPaymentPlan(
    manager: EntityManager,
    invoice: Invoice,
    tenantId: string,
  ): Promise<void> {
    // Idempotency kontrolü — zaten plan varsa atla
    const existing = await manager.query<{ id: string }[]>(
      `SELECT id FROM payment_plans WHERE invoice_id = $1 AND tenant_id = $2 LIMIT 1`,
      [invoice.id, tenantId],
    );
    if (existing.length > 0) return;

    // Vade tarihi: fatura dueDate yoksa issueDate + 30 gün
    const dueDate = invoice.dueDate
      ?? new Date(new Date(invoice.issueDate).getTime() + 30 * 24 * 60 * 60 * 1000);
    const dueDateStr = dueDate instanceof Date
      ? dueDate.toISOString().slice(0, 10)
      : String(dueDate);

    const [planRow] = await manager.query<{ id: string }[]>(
      `INSERT INTO payment_plans
         (id, tenant_id, invoice_id, installment_cnt, total_amount, notes, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 1, $3, $4, NOW(), NOW())
       RETURNING id`,
      [
        tenantId,
        invoice.id,
        invoice.total,
        `Otomatik oluşturuldu — Fatura ${invoice.invoiceNumber} onayı`,
      ],
    );

    if (!planRow?.id) {
      const planType = invoice.direction === 'OUT' ? 'AR' : 'AP';
      this.logger.warn(`${planType} ödeme planı oluşturulamadı: fatura=${invoice.invoiceNumber}`);
      return;
    }

    await manager.query(
      `INSERT INTO payment_installments
         (id, tenant_id, plan_id, installment_no, due_date, amount, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 1, $3, $4, NOW(), NOW())`,
      [tenantId, planRow.id, dueDateStr, invoice.total],
    );

    const planType = invoice.direction === 'OUT' ? 'AR' : 'AP';
    this.logger.log(
      `${planType} ödeme planı oluşturuldu: fatura=${invoice.invoiceNumber} ` +
      `vade=${dueDateStr} tutar=${invoice.total}`,
    );
  }

  private validateCreateDto(dto: CreateInvoiceDto): void {
    if (!dto.lines?.length) {
      throw new BadRequestException('Fatura en az bir satır içermelidir.');
    }

    if (dto.direction === 'OUT' && !dto.customerId) {
      throw new BadRequestException('Satış faturası için müşteri zorunludur.');
    }

    if (dto.direction === 'IN' && !dto.vendorId) {
      throw new BadRequestException('Alış faturası için tedarikçi zorunludur.');
    }

    for (const line of dto.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Miktar sıfırdan büyük olmalıdır.');
      }
      if (line.unitPrice < 0) {
        throw new BadRequestException('Birim fiyat negatif olamaz.');
      }
    }
  }
}
