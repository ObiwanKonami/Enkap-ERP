'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerApi, CustomerStatement } from '@/services/customer';

const fmtCurrency = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

export default function MutabakatPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: stmt, isLoading, error } = useQuery({
    queryKey: ['customer-statement', year, month],
    queryFn: () => customerApi.getStatement({ year, month }),
  });

  const statement = stmt as CustomerStatement | undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Cari Hesap Ekstresi
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            {MONTHS[month - 1]} {year} dönemi hesap hareketleriniz
          </p>
        </div>

        {/* Dönem Seçici */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="input"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            style={{ fontSize: 13 }}
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select
            className="input"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{ fontSize: 13, width: 90 }}
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Bakiye Özet */}
      {statement && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          {[
            { label: 'Açılış Bakiyesi',  value: fmtCurrency(statement.openingBalance),  accent: 'var(--text-2)' },
            { label: 'Toplam Borçlandı', value: fmtCurrency(statement.totalInvoiced),   accent: 'var(--danger)'  },
            { label: 'Toplam Ödendi',    value: fmtCurrency(statement.totalPaid),        accent: 'var(--success)' },
            {
              label: 'Kapanış Bakiyesi',
              value: fmtCurrency(statement.closingBalance),
              accent: statement.closingBalance > 0 ? 'var(--danger)' : 'var(--success)',
            },
          ].map(c => (
            <div key={c.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{c.label}</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 700, color: c.accent }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Ekstre Tablosu */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Hareket Listesi</div>
          {statement && (
            <a
              href={`/api/financial/portal/customer/statement/pdf?year=${year}&month=${month}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              PDF İndir
            </a>
          )}
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Yükleniyor...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>Ekstre yüklenemedi.</div>
        ) : !statement?.transactions?.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Bu dönemde hareket bulunmuyor.
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th>Referans</th>
                  <th style={{ textAlign: 'right' }}>Borç</th>
                  <th style={{ textAlign: 'right' }}>Alacak</th>
                  <th style={{ textAlign: 'right' }}>Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {statement.transactions.map((t, i) => (
                  <tr key={i}>
                    <td className="num" style={{ color: 'var(--text-2)', fontSize: 13 }}>{fmtDate(t.date)}</td>
                    <td>
                      <span className={`badge ${t.type === 'FATURA' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 11 }}>
                        {t.type}
                      </span>
                    </td>
                    <td className="num" style={{ color: 'var(--accent)', fontSize: 13 }}>{t.ref}</td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 500 }}>
                      {t.type === 'FATURA' ? fmtCurrency(t.amount) : '—'}
                    </td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 500 }}>
                      {t.type === 'ODEME' ? fmtCurrency(t.amount) : '—'}
                    </td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: t.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {fmtCurrency(t.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
          Bu ekstre bilgi amaçlıdır. Resmi mutabakat için Enkap ERP&apos;den oluşturulan belgeler geçerlidir.
        </div>
      </div>
    </div>
  );
}
