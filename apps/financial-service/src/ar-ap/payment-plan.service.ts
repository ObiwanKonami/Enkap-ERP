import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { getTenantContext } from '@enkap/database';
import { PaymentPlan }        from './entities/payment-plan.entity';
import { PaymentInstallment } from './entities/payment-installment.entity';

export interface CreatePlanDto {
  invoiceId:    string;
  /** Toplam tutarı eşit böl veya installments ile özel tutarlar ver */
  installments: {
    dueDate: string;   // 'YYYY-MM-DD'
    amount:  number;   // NUMERIC (money.ts ölçeği)
  }[];
  notes?: string;
}

export interface MarkPaidDto {
  installmentId: string;
  paymentRef?:   string;
  paidAt?:       string;  // ISO datetime, default: now
}

/**
 * Ödeme planı servisi.
 *
 * İş akışı:
 *  1. Fatura onaylandıktan sonra ödeme planı oluştur
 *  2. Her taksit için due_date + amount belirle
 *  3. Tahsilat gerçekleşince taksiti "ödendi" olarak işaretle
 *  4. Tüm taksitler ödenince reminder servisi durur
 */
@Injectable()
export class PaymentPlanService {
  private readonly logger = new Logger(PaymentPlanService.name);

  constructor(
    @InjectRepository(PaymentPlan)
    private readonly planRepo: Repository<PaymentPlan>,
    @InjectRepository(PaymentInstallment)
    private readonly installmentRepo: Repository<PaymentInstallment>,
  ) {}

  /** Faturanın ödeme planını getir */
  async findByInvoice(invoiceId: string): Promise<PaymentPlan | null> {
    const { tenantId } = getTenantContext();
    return this.planRepo.findOne({
      where: { tenantId, invoiceId },
    });
  }

  /** Ödeme planı + taksitler */
  async findByInvoiceWithInstallments(invoiceId: string): Promise<{
    plan: PaymentPlan;
    installments: PaymentInstallment[];
  }> {
    const { tenantId } = getTenantContext();

    const plan = await this.planRepo.findOne({ where: { tenantId, invoiceId } });
    if (!plan) {
      throw new NotFoundException(`Ödeme planı bulunamadı: fatura=${invoiceId}`);
    }

    const installments = await this.installmentRepo.find({
      where:  { tenantId, planId: plan.id },
      order:  { installmentNo: 'ASC' },
    });

    return { plan, installments };
  }

  /** Yeni ödeme planı oluştur */
  async create(dto: CreatePlanDto): Promise<PaymentPlan> {
    const { tenantId } = getTenantContext();

    // Fatura için plan zaten var mı?
    const existing = await this.findByInvoice(dto.invoiceId);
    if (existing) {
      throw new ConflictException(
        `Bu fatura için zaten bir ödeme planı mevcut: ${dto.invoiceId}`,
      );
    }

    if (!dto.installments.length) {
      throw new BadRequestException('En az bir taksit gerekli.');
    }

    const totalAmount = dto.installments.reduce((s, i) => s + i.amount, 0);

    const plan = this.planRepo.create({
      tenantId,
      invoiceId:      dto.invoiceId,
      installmentCnt: dto.installments.length,
      totalAmount,
      notes:          dto.notes ?? null,
    });

    const savedPlan = await this.planRepo.save(plan);

    // Taksit satırlarını toplu oluştur
    const installments = dto.installments.map((inst, idx) =>
      this.installmentRepo.create({
        tenantId,
        planId:        savedPlan.id,
        installmentNo: idx + 1,
        dueDate:       inst.dueDate,
        amount:        inst.amount,
        paidAt:        null,
        paymentRef:    null,
      }),
    );

    await this.installmentRepo.save(installments);

    this.logger.log(
      `Ödeme planı oluşturuldu: fatura=${dto.invoiceId}, ` +
      `taksit=${dto.installments.length}, toplam=${totalAmount}`,
    );

    return savedPlan;
  }

  /** Taksiti ödendi olarak işaretle */
  async markPaid(dto: MarkPaidDto): Promise<PaymentInstallment> {
    const { tenantId } = getTenantContext();

    const installment = await this.installmentRepo.findOne({
      where: { id: dto.installmentId, tenantId },
    });

    if (!installment) {
      throw new NotFoundException(`Taksit bulunamadı: ${dto.installmentId}`);
    }

    if (installment.paidAt) {
      throw new ConflictException('Bu taksit zaten ödenmiş.');
    }

    installment.paidAt     = dto.paidAt ? new Date(dto.paidAt) : new Date();
    installment.paymentRef = dto.paymentRef ?? null;

    const saved = await this.installmentRepo.save(installment);

    this.logger.log(
      `Taksit ödendi: ${dto.installmentId}, ` +
      `ref=${dto.paymentRef ?? '-'}, tenant=${tenantId}`,
    );

    return saved;
  }

  /**
   * Vadesi yaklaşan / geçmiş taksitler (hatırlatma servisi için).
   * Belirtilen gün aralığındaki ödenmemiş taksitlerde döner.
   */
  async getPendingInstallments(params: {
    dueBefore: Date;
    dueAfter:  Date;
  }): Promise<PaymentInstallment[]> {
    const { tenantId } = getTenantContext();

    return this.installmentRepo
      .createQueryBuilder('pi')
      .where('pi.tenant_id = :tenantId', { tenantId })
      .andWhere('pi.paid_at IS NULL')
      .andWhere('pi.due_date >= :after',  { after:  params.dueAfter.toISOString().slice(0, 10) })
      .andWhere('pi.due_date <= :before', { before: params.dueBefore.toISOString().slice(0, 10) })
      .orderBy('pi.due_date', 'ASC')
      .getMany();
  }
}
