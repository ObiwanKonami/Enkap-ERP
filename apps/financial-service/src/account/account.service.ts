import { Injectable, Logger } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Money, sumMoney } from '../shared/money';

export interface MizanRow {
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  totalDebit: Money;
  totalCredit: Money;
  netBalance: Money;
}

export interface MizanReport {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  rows: MizanRow[];
  totalDebit: Money;
  totalCredit: Money;
  /** Doğrulama: totalDebit === totalCredit olmalı */
  isBalanced: boolean;
}

export interface BalanceSheetSection {
  title: string;
  accounts: Array<{ code: string; name: string; amount: Money }>;
  total: Money;
}

export interface BalanceSheet {
  asOfDate: Date;
  aktif: BalanceSheetSection[]; // Varlıklar
  pasif: BalanceSheetSection[]; // Kaynaklar
  aktifTotal: Money;
  pasifTotal: Money;
  isBalanced: boolean;
}

/**
 * Muhasebe raporlama servisi.
 *
 * Üretilen raporlar:
 *  - Mizan (Trial Balance): borç/alacak toplamları ve bakiye
 *  - Bilanço (Balance Sheet): aktif/pasif karşılaştırması
 *  - Gelir Tablosu: dönem gelir-gider
 *
 * GİB e-Defter için temel girdi bu servisten alınır.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Belirtilen dönem için mizan (trial balance) üretir.
   *
   * SQL performans notu: journal_entry_lines tablosunda
   * (tenant_id, account_code) üzerinde indeks zorunludur (V004 migration'da var).
   */
  async getMizan(periodStart: Date, periodEnd: Date): Promise<MizanReport> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    this.logger.debug(
      `Mizan hesaplanıyor: tenant=${tenantId} ` +
      `dönem=${periodStart.toISOString().slice(0, 10)} - ` +
      `${periodEnd.toISOString().slice(0, 10)}`,
    );

    const rawRows = await dataSource.query<Array<{
      code: string;
      name: string;
      type: string;
      normal_balance: string;
      total_debit: string;
      total_credit: string;
    }>>(
      `SELECT
         a.code,
         a.name,
         a.type,
         a.normal_balance,
         COALESCE(SUM(jel.debit_amount), 0)  AS total_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS total_credit
       FROM accounts a
       LEFT JOIN journal_entry_lines jel
         ON jel.account_code = a.code
         AND jel.tenant_id = $1
       LEFT JOIN journal_entries je
         ON jel.entry_id = je.id
         AND je.entry_date BETWEEN $2 AND $3
         AND je.is_posted = true
       WHERE a.tenant_id = $1
         AND a.is_postable = true
       GROUP BY a.code, a.name, a.type, a.normal_balance
       HAVING COALESCE(SUM(jel.debit_amount), 0) > 0
          OR  COALESCE(SUM(jel.credit_amount), 0) > 0
       ORDER BY a.code`,
      [tenantId, periodStart, periodEnd],
    );

    const rows: MizanRow[] = rawRows.map((r) => {
      const totalDebit = Money.fromDecimal(r.total_debit);
      const totalCredit = Money.fromDecimal(r.total_credit);
      // Bakiye: normal borç hesaplar için borç - alacak, normal alacak için alacak - borç
      const netBalance =
        r.normal_balance === 'DEBIT'
          ? totalDebit.subtract(totalCredit)
          : totalCredit.subtract(totalDebit);

      return {
        code: r.code,
        name: r.name,
        type: r.type,
        normalBalance: r.normal_balance,
        totalDebit,
        totalCredit,
        netBalance,
      };
    });

    const totalDebit = sumMoney(rows.map((r) => r.totalDebit));
    const totalCredit = sumMoney(rows.map((r) => r.totalCredit));

    return {
      tenantId,
      periodStart,
      periodEnd,
      rows,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit.equals(totalCredit),
    };
  }

  /**
   * Bilanço (Balance Sheet) — belirtilen tarihteki finansal durum.
   *
   * Aktif = 1XX + 2XX hesaplar (borç bakiyeli)
   * Pasif = 3XX + 4XX + 5XX hesaplar (alacak bakiyeli)
   * Aktif toplamı = Pasif toplamı (temel muhasebe denklemi)
   */
  async getBilanco(asOfDate: Date): Promise<BalanceSheet> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    const rawRows = await dataSource.query<Array<{
      code: string;
      name: string;
      type: string;
      net_balance: string;
    }>>(
      `SELECT
         a.code,
         a.name,
         a.type,
         COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)
           AS net_balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_code = a.code AND jel.tenant_id = $1
       LEFT JOIN journal_entries je ON jel.entry_id = je.id
         AND je.entry_date <= $2
         AND je.is_posted = true
       WHERE a.tenant_id = $1
         AND a.is_postable = true
         AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
       GROUP BY a.code, a.name, a.type
       ORDER BY a.code`,
      [tenantId, asOfDate],
    );

    const aktifAccounts = rawRows
      .filter((r) => r.type === 'ASSET' && parseFloat(r.net_balance) !== 0)
      .map((r) => ({
        code: r.code,
        name: r.name,
        amount: Money.fromDecimal(Math.abs(parseFloat(r.net_balance))),
      }));

    const pasifAccounts = rawRows
      .filter((r) => (r.type === 'LIABILITY' || r.type === 'EQUITY') && parseFloat(r.net_balance) !== 0)
      .map((r) => ({
        code: r.code,
        name: r.name,
        amount: Money.fromDecimal(Math.abs(parseFloat(r.net_balance))),
      }));

    const aktifTotal = sumMoney(aktifAccounts.map((a) => a.amount));
    const pasifTotal = sumMoney(pasifAccounts.map((a) => a.amount));

    return {
      asOfDate,
      aktif: [
        { title: 'Dönen Varlıklar', accounts: aktifAccounts.filter((a) => a.code.startsWith('1')), total: sumMoney(aktifAccounts.filter((a) => a.code.startsWith('1')).map((a) => a.amount)) },
        { title: 'Duran Varlıklar', accounts: aktifAccounts.filter((a) => a.code.startsWith('2')), total: sumMoney(aktifAccounts.filter((a) => a.code.startsWith('2')).map((a) => a.amount)) },
      ],
      pasif: [
        { title: 'Kısa Vadeli Yabancı Kaynaklar', accounts: pasifAccounts.filter((a) => a.code.startsWith('3')), total: sumMoney(pasifAccounts.filter((a) => a.code.startsWith('3')).map((a) => a.amount)) },
        { title: 'Uzun Vadeli Yabancı Kaynaklar', accounts: pasifAccounts.filter((a) => a.code.startsWith('4')), total: sumMoney(pasifAccounts.filter((a) => a.code.startsWith('4')).map((a) => a.amount)) },
        { title: 'Öz Kaynaklar', accounts: pasifAccounts.filter((a) => a.code.startsWith('5')), total: sumMoney(pasifAccounts.filter((a) => a.code.startsWith('5')).map((a) => a.amount)) },
      ],
      aktifTotal,
      pasifTotal,
      isBalanced: aktifTotal.equals(pasifTotal),
    };
  }
}
