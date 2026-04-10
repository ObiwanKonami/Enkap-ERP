import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { serverFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, kurusToTl } from '@/lib/format';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, AlertCircle, Clock, CheckCircle2, ExternalLink, CalendarDays } from 'lucide-react';

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t('arAp.receivables.title')} — Enkap` };

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface ReceivableInvoice {
  id:            string;
  invoiceNumber: string;
  contactId:     string;
  contactName:   string;
  issueDate:     string;
  dueDate:       string;
  totalKurus:    number;
  paidKurus:     number;
  remainingKurus: number;
  agingDays:     number;   // 0 = vadesi gelmedi, >0 = gecikme günü
}

interface ReceivablesResponse {
  data:        ReceivableInvoice[];
  totalKurus:  number;
  overdueKurus: number;
}

// ─── Demo veri ────────────────────────────────────────────────────────────────

const DEMO: ReceivablesResponse = {
  totalKurus:   526500,
  overdueKurus: 165000,
  data: [
    { id: 'inv-1', invoiceNumber: 'FTR-2026-000042', contactId: 'c-1', contactName: 'ABC Teknoloji A.Ş.',    issueDate: '2026-03-15T00:00:00Z', dueDate: '2026-04-14T00:00:00Z', totalKurus: 120000, paidKurus: 0,      remainingKurus: 120000, agingDays: 0 },
    { id: 'inv-2', invoiceNumber: 'FTR-2026-000035', contactId: 'c-2', contactName: 'DEF Mühendislik Ltd.',  issueDate: '2026-02-20T00:00:00Z', dueDate: '2026-03-21T00:00:00Z', totalKurus: 85000,  paidKurus: 0,      remainingKurus: 85000,  agingDays: 29 },
    { id: 'inv-3', invoiceNumber: 'FTR-2026-000028', contactId: 'c-1', contactName: 'ABC Teknoloji A.Ş.',    issueDate: '2026-02-10T00:00:00Z', dueDate: '2026-03-11T00:00:00Z', totalKurus: 96000,  paidKurus: 48000,  remainingKurus: 48000,  agingDays: 39 },
    { id: 'inv-4', invoiceNumber: 'FTR-2026-000019', contactId: 'c-3', contactName: 'GHI Danışmanlık A.Ş.', issueDate: '2026-01-25T00:00:00Z', dueDate: '2026-02-24T00:00:00Z', totalKurus: 112500, paidKurus: 0,      remainingKurus: 112500, agingDays: 54 },
    { id: 'inv-5', invoiceNumber: 'FTR-2025-000198', contactId: 'c-4', contactName: 'JKL Ticaret Ltd.',      issueDate: '2025-12-01T00:00:00Z', dueDate: '2025-12-31T00:00:00Z', totalKurus: 160000, paidKurus: 95000,  remainingKurus: 65000,  agingDays: 109 },
    { id: 'inv-6', invoiceNumber: 'FTR-2026-000048', contactId: 'c-5', contactName: 'MNO Yazılım A.Ş.',      issueDate: '2026-03-17T00:00:00Z', dueDate: '2026-04-16T00:00:00Z', totalKurus: 96000,  paidKurus: 0,      remainingKurus: 96000,  agingDays: 0 },
  ],
};

// ─── Veri yükleme ─────────────────────────────────────────────────────────────

async function fetchReceivables(token: string): Promise<ReceivablesResponse> {
  return serverFetch<ReceivablesResponse>('financial', '/ar-ap/receivables', token)
    .catch(() => DEMO);
}

// ─── Yaşlandırma rengi ────────────────────────────────────────────────────────

function agingColor(days: number): string {
  if (days === 0)  return 'text-emerald-400';
  if (days <= 30)  return 'text-sky-400';
  if (days <= 60)  return 'text-amber-400';
  if (days <= 90)  return 'text-orange-400';
  return 'text-rose-400';
}

function agingLabel(days: number): string {
  if (days === 0)  return 'Vadesi Gelmedi';
  if (days <= 30)  return `${days}g gecikmiş`;
  if (days <= 60)  return `${days}g gecikmiş`;
  if (days <= 90)  return `${days}g gecikmiş`;
  return `${days}g gecikmiş`;
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default async function AlacaklarPage() {
  const session = await getServerSession(authOptions);
  const { data, totalKurus, overdueKurus } = await fetchReceivables(session?.user.accessToken ?? '');

  const notDueKurus = totalKurus - overdueKurus;
  const overdueCount = data.filter((i) => i.agingDays > 0).length;

  return (
    <div className="space-y-5">

      {/* ─── Geri + Başlık ─── */}
      <div>
        <Link href="/ar-ap" className="inline-flex items-center gap-1.5 text-xs text-text-3 hover:text-text-1 transition-colors mb-3">
          <ArrowLeft size={13} />
          {t('arAp.overview')}
        </Link>
        <h1 className="text-xl font-bold text-text-1 flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-400" />
          {t('arAp.receivables.title')}
        </h1>
        <p className="text-xs text-text-3 mt-0.5">{data.length} {t('arAp.receivables.openInvoices')}</p>
      </div>

      {/* ─── Özet ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryChip icon={<TrendingUp size={14} />}   label={t('arAp.receivables.totalReceivables')}    value={formatCurrency(kurusToTl(totalKurus))}   color="sky" />
        <SummaryChip icon={<CheckCircle2 size={14} />} label={t('arAp.receivables.notDue')}  value={formatCurrency(kurusToTl(notDueKurus))}  color="emerald" />
        <SummaryChip icon={<AlertCircle size={14} />}  label={t('arAp.receivables.overdueReceivables')}  value={formatCurrency(kurusToTl(overdueKurus))} color={overdueKurus > 0 ? 'rose' : 'emerald'} />
      </div>

      {/* ─── Gecikmiş uyarısı ─── */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/25">
          <AlertCircle size={15} className="text-rose-400 shrink-0" />
          <p className="text-sm text-rose-300">
            <span className="font-semibold">{overdueCount} {t('arAp.receivables.invoices')}</span> {t('arAp.receivables.overdueWarning')}
          </p>
        </div>
      )}

      {/* ─── Tablo ─── */}
      <div className="card p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="text-left pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.invoiceNumber')}</th>
                <th className="text-left pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.customer')}</th>
                <th className="text-left pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.dueDate')}</th>
                <th className="text-right pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.total')}</th>
                <th className="text-right pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.remaining')}</th>
                <th className="text-left pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.status')}</th>
                <th className="text-left pb-2 text-text-3 font-medium">{t('arAp.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv, i) => (
                <tr key={inv.id} className={`border-b border-ink-800/60 ${i % 2 === 0 ? '' : 'bg-ink-900/40'}`}>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/faturalar/${inv.id}`}
                      className="num text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                    >
                      {inv.invoiceNumber}
                      <ExternalLink size={10} />
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-text-2">{inv.contactName}</td>
                  <td className="py-2.5 pr-3 text-text-2">{formatDate(inv.dueDate)}</td>
                  <td className="py-2.5 pr-3 text-right num text-text-1">{formatCurrency(kurusToTl(inv.totalKurus))}</td>
                  <td className="py-2.5 pr-3 text-right num font-semibold text-text-1">{formatCurrency(kurusToTl(inv.remainingKurus))}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${agingColor(inv.agingDays)}`}>
                      {inv.agingDays > 0 ? <Clock size={10} /> : <CheckCircle2 size={10} />}
                      {agingLabel(inv.agingDays)}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {inv.remainingKurus > 0 && (
                      <Link
                        href={`/ar-ap/odeme-plani/${inv.id}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        <CalendarDays size={10} />
                        {t('arAp.receivables.paymentPlan')}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Özet chip ────────────────────────────────────────────────────────────────

function SummaryChip({ icon, label, value, color }: {
  icon:  React.ReactNode; label: string; value: string;
  color: 'sky' | 'emerald' | 'amber' | 'rose';
}) {
  const colorMap = {
    sky:     'text-sky-400     bg-sky-500/10     border-sky-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber:   'text-amber-400   bg-amber-500/10   border-amber-500/20',
    rose:    'text-rose-400    bg-rose-500/10    border-rose-500/20',
  };
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${colorMap[color]}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-text-3 uppercase tracking-wider font-medium truncate">{label}</p>
        <p className="num text-sm font-bold text-text-1 leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}
