import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';

export interface JournalLine {
  accountCode:  string;
  description:  string;
  debitAmount:  number;  // kuruş
  creditAmount: number;  // kuruş
}

export interface CreateJournalEntryDto {
  entryDate:     string;   // YYYY-MM-DD
  description:   string;
  referenceType: string;   // FUEL_EXPENSE | MAINTENANCE_EXPENSE | FLEET_EXPENSE vb.
  referenceId:   string;   // kaynak kayıt UUID
  createdBy:     string;
  lines:         JournalLine[];
}

@Injectable()
export class JournalEntryService {
  private readonly logger = new Logger(JournalEntryService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return { ds, tenantId };
  }

  /**
   * Harici servislerden yevmiye kaydı oluşturur.
   *
   * Borç/Alacak dengesi zorunlu — toplam debit ≠ toplam credit ise hata fırlatır.
   */
  async create(dto: CreateJournalEntryDto): Promise<{ id: string; entryNumber: string }> {
    const { ds, tenantId } = await this.repos();

    // Denge kontrolü
    const totalDebit  = dto.lines.reduce((s, l) => s + l.debitAmount,  0);
    const totalCredit = dto.lines.reduce((s, l) => s + l.creditAmount, 0);
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(
        `Yevmiye dengesi bozuk: borç=${totalDebit} alacak=${totalCredit}`,
      );
    }

    // YEV numarası — referenceType + referenceId'den türetilir
    const shortRef    = dto.referenceId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const entryNumber = `YEV-${dto.referenceType.slice(0, 8)}-${shortRef}`;

    return ds.transaction(async (em) => {
      // journal_entries
      await em.query(
        `INSERT INTO journal_entries
           (id, tenant_id, entry_number, entry_date, description,
            reference_type, reference_id, is_posted, posted_at, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW(), $7)
         ON CONFLICT (entry_number, tenant_id) DO NOTHING`,
        [
          tenantId,
          entryNumber,
          dto.entryDate,
          dto.description,
          dto.referenceType,
          dto.referenceId,
          dto.createdBy,
        ],
      );

      const [row] = await em.query<[{ id: string }]>(
        `SELECT id FROM journal_entries WHERE entry_number = $1 AND tenant_id = $2`,
        [entryNumber, tenantId],
      );

      if (!row?.id) {
        this.logger.warn(`[${tenantId}] Yevmiye zaten mevcut, atlandı: ${entryNumber}`);
        return { id: '', entryNumber };
      }

      // journal_entry_lines
      for (const line of dto.lines) {
        if (line.debitAmount === 0 && line.creditAmount === 0) continue;
        await em.query(
          `INSERT INTO journal_entry_lines
             (id, tenant_id, entry_id, account_code, description, debit_amount, credit_amount)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
          [tenantId, row.id, line.accountCode, line.description, line.debitAmount, line.creditAmount],
        );
      }

      this.logger.log(`[${tenantId}] Yevmiye oluşturuldu: ${entryNumber}`);
      return { id: row.id, entryNumber };
    });
  }
}
