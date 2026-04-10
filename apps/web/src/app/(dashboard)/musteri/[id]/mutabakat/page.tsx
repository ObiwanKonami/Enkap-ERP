'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { financialApi } from '@/services/financial';
import { formatCurrency, formatDate, kurusToTl } from '@/lib/format';
import Link from 'next/link';
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  TrendingUp, TrendingDown, Scale, FileText,
} from 'lucide-react';
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";

const t = createTranslator(DEFAULT_LOCALE);

// ─── Backend response tipi ────────────────────────────────────────────────────

interface ReconciliationLine {
  invoiceId:   string;
  invoiceNo:   string;
  invoiceDate: string;
  dueDate:     string | null;
  direction:   'IN' | 'OUT';
  amount:      number;   // kuruş
  status:      string;
  isPaid:      boolean;
}

interface ReconciliationStatement {
  tenantId:        string;
  contactId:       string;
  contactName:     string;
  contactType:     'customer' | 'vendor';
  generatedAt:     string;
  lines:           ReconciliationLine[];
  totalReceivable: number;  // kuruş — OUT yönlü faturalar
  totalPayable:    number;  // kuruş — IN yönlü faturalar
  netBalance:      number;  // pozitif = alacak, negatif = borç
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function fmt(k: number) { return formatCurrency(kurusToTl(k)); }

const thStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 11, fontWeight: 600,
  color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
  background: 'rgba(30,58,95,0.1)', borderBottom: '1px solid var(--border)',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:        'Taslak',
  PENDING_GIB:  'GİB Kuyruğu',
  SENT_GIB:     'Gönderildi',
  ACCEPTED_GIB: 'Onaylandı',
  REJECTED_GIB: 'Reddedildi',
  CANCELLED:    'İptal',
};

const STATUS_CLS: Record<string, string> = {
  ACCEPTED_GIB: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  SENT_GIB:     'border-sky-500/30     bg-sky-500/10     text-sky-400',
  PENDING_GIB:  'border-sky-500/30     bg-sky-500/10     text-sky-400',
  REJECTED_GIB: 'border-red-500/30     bg-red-500/10     text-red-400',
  DRAFT:        'border-slate-500/30   bg-slate-500/10   text-slate-400',
  CANCELLED:    'border-slate-500/30   bg-slate-500/10   text-slate-400',
};

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function MutabakatPage() {
  const params    = useParams<{ id: string }>();
  const contactId = params.id;

  const { data: stmt, isLoading, isError } = useQuery({
    queryKey: ['reconciliation', contactId],
    queryFn:  () => financialApi.arAp.reconciliation(contactId).then((r: { data: ReconciliationStatement }) => r.data),
    staleTime: 30_000,
  });

  const { mutate: downloadPdf, isPending: isDownloading } = useMutation({
    mutationFn: () => financialApi.arAp.reconciliationPdf(contactId),
    onSuccess: (res: { data: Blob }) => {
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `mutabakat-${(stmt?.contactName ?? 'musteri').replace(/\s+/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)' }}>
        <Loader2 size={24} className="animate-spin"/>
      </div>
    );
  }

  if (isError || !stmt) {
    return (
      <div className="space-y-5">
        <Link href={`/musteri/${contactId}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
          background: 'rgba(30,58,95,0.3)', border: '1px solid rgba(30,58,95,0.5)',
          borderRadius: 6, padding: '6px 10px', color: 'var(--text-2)', textDecoration: 'none',
        }}>
          <ArrowLeft size={13}/> Müşteri
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#F87171', fontSize: 13 }}>
          <AlertCircle size={14}/> Mutabakat ekstresi yüklenemedi. Finansal servis bağlantısını kontrol edin.
        </div>
      </div>
    );
  }

  const balanceColor = stmt.netBalance >= 0 ? '#34D399' : '#F87171';
  const balanceLabel = stmt.netBalance >= 0 ? 'Alacak Bakiye' : 'Borç Bakiye';

  return (
    <div className="space-y-5">

      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/musteri/${contactId}`} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            background: 'rgba(30,58,95,0.3)', border: '1px solid rgba(30,58,95,0.5)',
            borderRadius: 6, padding: '6px 10px', color: 'var(--text-2)', textDecoration: 'none',
          }}>
            <ArrowLeft size={13}/> {stmt.contactName}
          </Link>
          <h1 className="text-xl font-bold text-text-1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale size={20} style={{ color: '#38BDF8' }}/> Mutabakat Ekstresi
          </h1>
        </div>
        <button className="btn-primary h-9 px-4 text-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => downloadPdf()} disabled={isDownloading}>
          {isDownloading
            ? <><Loader2 size={14} className="animate-spin"/> İndiriliyor…</>
            : <><Download size={14}/> PDF İndir</>}
        </button>
      </div>

      {/* KPI'lar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Toplam Alacak',    value: fmt(stmt.totalReceivable), icon: <TrendingUp size={14}/>,  color: '#38BDF8' },
          { label: 'Toplam Borç',      value: fmt(stmt.totalPayable),    icon: <TrendingDown size={14}/>, color: '#FCD34D' },
          { label: balanceLabel,       value: fmt(Math.abs(stmt.netBalance)), icon: <Scale size={14}/>,   color: balanceColor },
          { label: 'İşlem Sayısı',     value: String(stmt.lines.length), icon: <FileText size={14}/>,    color: '#A78BFA' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: 1, minWidth: 150, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: k.color }}>{k.icon}</span>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            </div>
            <div className="num" style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Net bakiye özeti */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Net Bakiye</div>
            <div className="num" style={{ fontSize: 28, fontWeight: 700, color: balanceColor }}>
              {stmt.netBalance >= 0 ? '+' : '-'}{fmt(Math.abs(stmt.netBalance))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              {stmt.netBalance >= 0 ? 'Müşteriden tahsil edilecek' : 'Müşteriye ödenecek'} · {stmt.generatedAt}
            </div>
          </div>
          {/* Denge barı */}
          <div style={{ minWidth: 220, flex: 1, maxWidth: 340 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>Alacak</span><span>Borç</span>
            </div>
            {(() => {
              const total = stmt.totalReceivable + stmt.totalPayable;
              const rcvPct = total > 0 ? (stmt.totalReceivable / total) * 100 : 50;
              return (
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(30,58,95,0.4)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${rcvPct}%`, background: '#38BDF8', borderRadius: '3px 0 0 3px' }}/>
                  <div style={{ width: `${100 - rcvPct}%`, background: '#FCD34D', borderRadius: '0 3px 3px 0' }}/>
                </div>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
              <span className="num" style={{ color: '#38BDF8' }}>{fmt(stmt.totalReceivable)}</span>
              <span className="num" style={{ color: '#FCD34D' }}>{fmt(stmt.totalPayable)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fatura listesi */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={12}/> Fatura Hareketleri
          <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({stmt.lines.length} kayıt)</span>
        </div>
        {stmt.lines.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>İşlem bulunamadı.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Tarih</th>
                <th style={thStyle}>Fatura No</th>
                <th style={thStyle}>Yön</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tutar</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Durum</th>
                <th style={thStyle}>Vade</th>
              </tr>
            </thead>
            <tbody>
              {stmt.lines.map((line, i) => (
                <tr key={line.invoiceId}
                  style={{ borderBottom: i < stmt.lines.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(14,165,233,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="num" style={{ fontSize: 12, color: 'var(--text-2)' }}>{line.invoiceDate}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Link href={`/faturalar/${line.invoiceId}`}
                      style={{ fontSize: 12, color: '#38BDF8', textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace' }}>
                      {line.invoiceNo}
                    </Link>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: 12, color: line.direction === 'OUT' ? '#38BDF8' : '#FCD34D', fontWeight: 500 }}>
                      {line.direction === 'OUT' ? 'Satış' : 'Alış'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 600, color: line.direction === 'OUT' ? '#38BDF8' : '#FCD34D' }}>
                      {fmt(line.amount)}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                    <span className={`border text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[line.status] ?? 'border-slate-500/30 bg-slate-500/10 text-slate-400'}`}>
                      {STATUS_LABELS[line.status] ?? line.status}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {line.dueDate
                      ? <span className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{line.dueDate}</span>
                      : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(14,165,233,0.04)', borderTop: '2px solid var(--border)' }}>
                <td colSpan={3} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Net Bakiye
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, color: balanceColor }}>
                    {stmt.netBalance >= 0 ? '+' : '-'}{fmt(Math.abs(stmt.netBalance))}
                  </span>
                </td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
