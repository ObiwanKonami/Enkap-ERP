'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerApi, CustomerPayment } from '@/services/customer';

const fmtCurrency = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const METHOD_LABELS: Record<string, string> = {
  HAVALE:       'Banka Havalesi',
  EFT:          'EFT',
  KREDI_KARTI:  'Kredi Kartı',
  NAKIT:        'Nakit',
};

export default function OdemelerPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-payments'],
    queryFn: () => customerApi.getPayments(),
  });

  const payments: CustomerPayment[] = Array.isArray(data)
    ? data
    : (data as { data: CustomerPayment[] } | undefined)?.data ?? [];

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const thisMonth = new Date().getMonth();
  const thisMonthTotal = payments
    .filter(p => new Date(p.date).getMonth() === thisMonth)
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Ödemeler
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Ödeme geçmişiniz ve bekleyen ödemeler
        </p>
      </div>

      {/* Özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { label: 'Toplam Ödenen',   value: fmtCurrency(totalPaid),      accent: 'var(--text-1)' },
          { label: 'Bu Ay Ödenen',    value: fmtCurrency(thisMonthTotal),  accent: 'var(--accent)'  },
          { label: 'Toplam İşlem',    value: `${payments.length} adet`,    accent: 'var(--text-2)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{c.label}</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 700, color: c.accent }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tablo */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Ödeme Geçmişi</div>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Yükleniyor...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>
            Ödemeler yüklenemedi.
          </div>
        ) : payments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Henüz ödeme kaydı bulunmuyor.
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Referans</th>
                  <th>Tarih</th>
                  <th>Ödeme Yöntemi</th>
                  <th>İlgili Fatura</th>
                  <th style={{ textAlign: 'right' }}>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="num" style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 13 }}>
                      {p.reference}
                    </td>
                    <td className="num" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                      {fmtDate(p.date)}
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>
                      {METHOD_LABELS[p.method] ?? p.method}
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: 13 }}>
                      {p.invoiceNo ?? '—'}
                    </td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                      {fmtCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
