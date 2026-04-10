import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { TreasuryAccount }     from '../account/entities/treasury-account.entity';
import { TreasuryTransaction } from './entities/treasury-transaction.entity';
import { TreasuryEventsPublisher } from '../events/treasury-events.publisher';
import type { CreateTransactionDto } from './dto/create-transaction.dto';

/** Hareket tipine göre yön hesapla */
function resolveDirection(type: TreasuryTransaction['transactionType']): 'IN' | 'OUT' {
  const inTypes: TreasuryTransaction['transactionType'][] = [
    'TAHSILAT', 'FAIZ_GELIRI', 'DIGER_GELIR',
  ];
  return inTypes.includes(type) ? 'IN' : 'OUT';
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly eventsPublisher: TreasuryEventsPublisher,
  ) {}

  /**
   * Yeni hareket oluştur.
   *
   * PESSIMISTIC_WRITE lock ile bakiye güncellemesi race-free.
   * TRANSFER tipi: kaynak hesaptan çıkar, hedef hesaba ekle (2 satır).
   */
  async create(
    accountId: string,
    dto: CreateTransactionDto,
    createdBy: string,
  ): Promise<TreasuryTransaction> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    if (dto.transactionType === 'TRANSFER' && !dto.targetAccountId) {
      throw new BadRequestException('TRANSFER hareketi için targetAccountId gereklidir.');
    }

    const result = await ds.transaction(async (em) => {
      // Kaynak hesap — lock
      const account = await em.findOne(TreasuryAccount, {
        where: { id: accountId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) throw new NotFoundException(`Hesap bulunamadı: ${accountId}`);

      const direction  = resolveDirection(dto.transactionType);
      const delta      = direction === 'IN' ? dto.amountKurus : -dto.amountKurus;
      const newBalance = account.balanceKurus + delta;

      account.balanceKurus = newBalance;
      await em.save(TreasuryAccount, account);

      const tx = em.create(TreasuryTransaction, {
        tenantId,
        accountId,
        transactionType:  dto.transactionType,
        amountKurus:      dto.amountKurus,
        direction,
        runningBalance:   newBalance,
        transactionDate:  new Date(dto.transactionDate),
        description:      dto.description,
        referenceType:    dto.referenceType,
        referenceId:      dto.referenceId,
        targetAccountId:  dto.targetAccountId,
        reconciliationStatus: 'BEKLIYOR',
        createdBy,
      });
      const saved = await em.save(TreasuryTransaction, tx);

      // TRANSFER: hedef hesaba giriş yap
      if (dto.transactionType === 'TRANSFER' && dto.targetAccountId) {
        const target = await em.findOne(TreasuryAccount, {
          where: { id: dto.targetAccountId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!target) throw new NotFoundException(`Hedef hesap bulunamadı: ${dto.targetAccountId}`);

        target.balanceKurus += dto.amountKurus;
        await em.save(TreasuryAccount, target);

        const counterTx = em.create(TreasuryTransaction, {
          tenantId,
          accountId:        dto.targetAccountId,
          transactionType:  'TRANSFER',
          amountKurus:      dto.amountKurus,
          direction:        'IN',
          runningBalance:   target.balanceKurus,
          transactionDate:  new Date(dto.transactionDate),
          description:      dto.description ? `[Transfer karşı kaydı] ${dto.description}` : '[Transfer karşı kaydı]',
          referenceType:    dto.referenceType,
          referenceId:      dto.referenceId,
          targetAccountId:  accountId, // karşı taraf
          reconciliationStatus: 'BEKLIYOR',
          createdBy,
        });
        await em.save(TreasuryTransaction, counterTx);

        this.logger.log(`[${tenantId}] Transfer: ${accountId} → ${dto.targetAccountId} — ${dto.amountKurus} kuruş`);
      }

      return saved;
    });

    // Fatura ödemesi ise financial-service'e bildir (AP taksit kapatma + yevmiye)
    if (dto.referenceType === 'INVOICE' && dto.referenceId) {
      this.eventsPublisher.publishPaymentCreated({
        tenantId,
        transactionId:   result.id,
        accountId,
        transactionType: dto.transactionType,
        amountKurus:     dto.amountKurus,
        transactionDate: dto.transactionDate,
        invoiceId:       dto.referenceId,
        referenceType:   dto.referenceType,
        referenceId:     dto.referenceId,
        description:     dto.description,
        createdBy:       createdBy,
      });
    }

    return result;
  }

  /** Hesap hareketlerini listele */
  async listByAccount(
    accountId: string,
    params?: { limit?: number; offset?: number; fromDate?: string; toDate?: string },
  ): Promise<{ data: TreasuryTransaction[]; total: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const qb = ds.getRepository(TreasuryTransaction)
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.account_id = :accountId', { accountId })
      .orderBy('t.transaction_date', 'DESC')
      .addOrderBy('t.created_at', 'DESC');

    if (params?.fromDate) qb.andWhere('t.transaction_date >= :from', { from: params.fromDate });
    if (params?.toDate)   qb.andWhere('t.transaction_date <= :to',   { to: params.toDate });

    const limit  = Math.min(params?.limit  ?? 50, 500);
    const offset = params?.offset ?? 0;

    const [data, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { data, total };
  }
}
