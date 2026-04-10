'use client';

import Link from 'next/link';
import { formatCurrency, kurusToTl } from '@/lib/format';
import type { PayrollSummary } from './page';

// ─── Prop tipleri ────────────────────────────────────────────────────────────

interface Props {
  payrollHistory: PayrollSummary[];
  ayAdlari:       string[];
}

// ─── Durum badge bileşeni ────────────────────────────────────────────────────

function PayrollStatusBadge({ status }: { status: PayrollSummary['status'] }) {
  const map: Record<PayrollSummary['status'], { cls: string; label: string }> = {
    APPROVED: { cls: 'badge-success', label: 'Onaylı' },
    PENDING:  { cls: 'badge-warning', label: 'Bekliyor' },
  };
  const { cls, label } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ─── Son Bordro Geçmişi istemci bileşeni ─────────────────────────────────────

export function EmployeeDetailClient({ payrollHistory, ayAdlari }: Props) {
  return (
    <div className="card p-5 h-full">
      <h2 className="text-sm font-semibold text-text-1 mb-4">
        Son Bordro Geçmişi
      </h2>

      {payrollHistory.length === 0 ? (
        <p className="text-xs text-text-3 py-4 text-center">
          Bordro kaydı bulunamadı.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-text-3 font-medium pb-3 pr-4">
                  Dönem
                </th>
                <th className="text-right text-xs text-text-3 font-medium pb-3 pr-4">
                  Brüt
                </th>
                <th className="text-right text-xs text-text-3 font-medium pb-3 pr-4">
                  Net
                </th>
                <th className="text-right text-xs text-text-3 font-medium pb-3">
                  Durum
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payrollHistory.map((entry) => {
                // Türkçe ay adı ve yıl ile dönem etiketi oluştur
                const donemEtiketi = `${ayAdlari[entry.month - 1]} ${entry.year}`;

                return (
                  <tr key={`${entry.year}-${entry.month}`} className="hover:bg-bg-hover transition-colors">
                    <td className="py-3 pr-4">
                      {/* Bordro sayfasına dönem parametresiyle bağlantı */}
                      <Link
                        href={`/bordro?year=${entry.year}&month=${entry.month}`}
                        className="text-sky-400 hover:text-sky-300 hover:underline transition-colors font-medium"
                      >
                        {donemEtiketi}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {/* Kuruştan TL'ye çevirerek formatla */}
                      <span className="num text-text-2">
                        {formatCurrency(kurusToTl(entry.grossSalaryKurus))}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {/* Net maaş — daha belirgin göster */}
                      <span className="num font-semibold text-text-1">
                        {formatCurrency(kurusToTl(entry.netSalaryKurus))}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <PayrollStatusBadge status={entry.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
