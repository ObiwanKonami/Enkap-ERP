'use client';

import { useQuery } from '@tanstack/react-query';
import { supplierApi, SupplierInvoice } from '@/services/supplier';

const fmtCurrency = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  ODENDI:      { label: 'Ödendi',           badgeClass: 'badge-success' },
  BEKLIYOR:    { label: 'Ödeme Bekleniyor', badgeClass: 'badge-warning' },
  REDDEDILDI:  { label: 'Reddedildi',       badgeClass: 'badge-danger'  },
};

export default function SupplierFaturalarPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['supplier-invoices'],
    queryFn: () => supplierApi.getInvoices(),
  });

  const invoices: SupplierInvoice[] = Array.isArray(data)
    ? data
    : (data as { data: SupplierInvoice[] } | undefined)?.data ?? [];

  const totalPaid = invoices.filter(i => i.status === 'ODENDI').reduce((s, i) => s + i.amountKurus, 0);
  const totalPending = invoices.filter(i => i.status === 'BEKLIYOR').reduce((s, i) => s + i.amountKurus, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Faturalarım
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Enkap'a kestiğiniz faturalar ve ödeme durumları
        </p>
      </div>

      {/* Özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Ödenen',       value: fmtCurrency(totalPaid),    accent: 'var(--success)' },
          { label: 'Bekleyen',     value: fmtCurrency(totalPending),  accent: 'var(--warning)' },
          { label: 'Toplam Fatura', value: `${invoices.length} adet`, accent: 'var(--text-2)'  },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{c.label}</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 700, color: c.accent }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tablo */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Fatura Listesi</div>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Yükleniyor...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>Faturalar yüklenemedi.</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Henüz fatura bulunmuyor.
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fatura No</th>
                  <th>PO Referans</th>
                  <th>Fatura Tarihi</th>
                  <th>Vade</th>
                  <th style={{ textAlign: 'right' }}>Tutar</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const cfg = STATUS_CONFIG[inv.status] ?? { label: inv.status, badgeClass: '' };
                  return (
                    <tr key={inv.id}>
                      <td className="num" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>
                        {inv.invoiceNo}
                      </td>
                      <td className="num" style={{ color: 'var(--text-3)', fontSize: 13 }}>
                        {inv.poReference ?? '—'}
                      </td>
                      <td className="num" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        {fmtDate(inv.issueDate)}
                      </td>
                      <td className="num" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        {fmtDate(inv.dueDate)}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-1)' }}>
                        {fmtCurrency(inv.amountKurus)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${cfg.badgeClass}`} style={{ fontSize: 11 }}>{cfg.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
