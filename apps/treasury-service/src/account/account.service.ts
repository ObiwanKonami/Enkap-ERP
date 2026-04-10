import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { TreasuryAccount } from './entities/treasury-account.entity';
import type { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  async create(dto: CreateAccountDto, createdBy: string): Promise<TreasuryAccount> {
    const { tenantId } = getTenantContext();
    const repo = (await this.dsManager.getDataSource(tenantId)).getRepository(TreasuryAccount);

    const account = repo.create({
      tenantId,
      name:          dto.name,
      accountType:   dto.accountType,
      currency:      dto.currency ?? 'TRY',
      balanceKurus:  0,
      bankAccountNo: dto.bankAccountNo,
      iban:          dto.iban,
      bankName:      dto.bankName,
      isActive:      true,
      createdBy,
    });
    return repo.save(account);
  }

  async findAll(page = 1, limit = 50): Promise<{ items: TreasuryAccount[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const repo = (await this.dsManager.getDataSource(tenantId)).getRepository(TreasuryAccount);
    const [items, total] = await repo.findAndCount({
      where: { tenantId, isActive: true },
      order: { accountType: 'ASC', name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<TreasuryAccount> {
    const { tenantId } = getTenantContext();
    const repo = (await this.dsManager.getDataSource(tenantId)).getRepository(TreasuryAccount);
    const acc = await repo.findOne({ where: { id, tenantId } });
    if (!acc) throw new NotFoundException(`Hesap bulunamadı: ${id}`);
    return acc;
  }

  async deactivate(id: string): Promise<void> {
    const { tenantId } = getTenantContext();
    const repo = (await this.dsManager.getDataSource(tenantId)).getRepository(TreasuryAccount);
    const acc = await repo.findOne({ where: { id, tenantId } });
    if (!acc) throw new NotFoundException(`Hesap bulunamadı: ${id}`);
    acc.isActive = false;
    await repo.save(acc);
    this.logger.log(`[${tenantId}] Hesap deaktive edildi: ${id}`);
  }

  /**
   * Tüm hesapların toplam bakiyesi (para birimi bazında)
   */
  async getTotalBalances(): Promise<Array<{ currency: string; totalKurus: number }>> {
    const { tenantId } = getTenantContext();
    const repo = (await this.dsManager.getDataSource(tenantId)).getRepository(TreasuryAccount);

    const rows = await repo
      .createQueryBuilder('a')
      .select('a.currency', 'currency')
      .addSelect('SUM(a.balance_kurus)', 'totalKurus')
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.is_active = true')
      .groupBy('a.currency')
      .getRawMany<{ currency: string; totalKurus: string }>();

    return rows.map(r => ({ currency: r.currency, totalKurus: Number(r.totalKurus) }));
  }
}
