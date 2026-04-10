'use client';

import { useQuery } from '@tanstack/react-query';
import { customerApi, CustomerInvoice, CustomerInvoiceStatus } from '@/services/customer';

const fmtCurrency = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const STATUS_CONFIG: Record<CustomerInvoiceStatus, { label: string; badgeClass: string }> = {
  ODENDI:       { label: 'Ödendi',        badgeClass: 'badge-success' },
  BEKLIYOR:     { label: 'Bekliyor',       badgeClass: 'badge-info'    },
  VADESI_GECMIS: { label: 'Vadesi Geçmiş', badgeClass: 'badge-danger'  },
};

export default function CustomerFaturalarPage() {
  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ['customer-invoices'],
    queryFn: () => customerApi.getInvoices(),
  });

  const { data: summary } = useQuery({
    queryKey: ['customer-summary'],
    queryFn: () => customerApi.getSummary().then(r => r.data),
  });

  const list = Array.isArray(invoices) ? invoices : (invoices as { data: CustomerInvoice[] } | undefined)?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Faturalarım
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Tüm fatura geçmişinizi görüntüleyin ve PDF olarak indirin.
        </p>
      </div>

      {/* Özet Kartlar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <SummaryCard
          label="Toplam Açık Bakiye"
          value={summary ? fmtCurrency(summary.totalOutstanding) : '—'}
          accent="var(--text-1)"
        />
        <SummaryCard
          label="Vadesi Geçmiş"
          value={summary ? fmtCurrency(summary.totalOverdue) : '—'}
          accent="var(--danger)"
        />
        <SummaryCard
          label="Son Ödeme"
          value={summary?.lastPaymentDate ? fmtDate(summary.lastPaymentDate) : '—'}
          accent="var(--success)"
        />
      </div>

      {/* Fatura Tablosu */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Fatura Listesi</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
              {list.length} fatura
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Yükleniyor...
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>
            Faturalar yüklenemedi. Lütfen sayfayı yenileyin.
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Henüz fatura bulunmuyor.
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fatura No</th>
                  <th>Açıklama</th>
                  <th>Fatura Tarihi</th>
                  <th>Vade Tarihi</th>
                  <th style={{ textAlign: 'right' }}>Tutar</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                  <th style={{ textAlign: 'center' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {list.map((invoice) => {
                  const cfg = STATUS_CONFIG[invoice.status];
                  const overdue = invoice.status === 'VADESI_GECMIS';
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <span className="num" style={{ fontWeight: 500, color: 'var(--accent)', fontSize: 13 }}>
                          {invoice.invoiceNo}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-2)', maxWidth: 240 }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {invoice.description}
                        </span>
                      </td>
                      <td className="num" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        {fmtDate(invoice.issueDate)}
                      </td>
                      <td className="num" style={{ fontSize: 13, color: overdue ? 'var(--danger)' : 'var(--text-2)', fontWeight: overdue ? 500 : 400 }}>
                        {fmtDate(invoice.dueDate)}
                        {overdue && <span style={{ marginLeft: 4, fontSize: 10, verticalAlign: 'middle' }}>⚠</span>}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-1)' }}>
                        {fmtCurrency(invoice.amountKurus)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${cfg.badgeClass}`}>{cfg.label}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <a
                          href={customerApi.getInvoicePdfUrl(invoice.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          PDF
                        </a>
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

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700, color: accent, letterSpacing: '-0.03em' }}>{value}</div>
    </div>
  );
}
