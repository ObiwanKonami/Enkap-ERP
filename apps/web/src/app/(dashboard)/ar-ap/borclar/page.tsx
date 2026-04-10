import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { serverFetch } from '@/lib/api-client';
import { formatCurrency, formatDate, kurusToTl } from '@/lib/format';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import Link from 'next/link';
import { ArrowLeft, TrendingDown, AlertCircle, Clock, CheckCircle2, ExternalLink } from 'lucide-react';

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t('arAp.payables.title')} — Enkap` };

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface PayableInvoice {
  id:             string;
  invoiceNumber:  string;
  contactId:      string;
  contactName:    string;
  issueDate:      string;
  dueDate:        string;
  totalKurus:     number;
  paidKurus:      number;
  remainingKurus: number;
  agingDays:      number;
}

interface PayablesResponse {
  data:         PayableInvoice[];
  totalKurus:   number;
  overdueKurus: number;
}

// ─── Demo veri ────────────────────────────────────────────────────────────────

const DEMO: PayablesResponse = {
  totalKurus:   389000,
  overdueKurus: 75000,
  data: [
    { id: 'pi-1', invoiceNumber: 'GID-2026-000018', contactId: 't-1', contactName: 'Yazıcı Kırtasiye Ltd.',  issueDate: '2026-03-10T00:00:00Z', dueDate: '2026-04-09T00:00:00Z', totalKurus: 85000,  paidKurus: 0,     remainingKurus: 85000,  agingDays: 0 },
    { id: 'pi-2', invoiceNumber: 'GID-2026-000011', contactId: 't-2', contactName: 'Tekno Donanım A.Ş.',    issueDate: '2026-02-15T00:00:00Z', dueDate: '2026-03-17T00:00:00Z', totalKurus: 142000, paidKurus: 0,     remainingKurus: 142000, agingDays: 33 },
    { id: 'pi-3', invoiceNumber: 'GID-2026-000005', contactId: 't-3', contactName: 'Ofis Ekipmanları Ltd.', issueDate: '2026-02-01T00:00:00Z', dueDate: '2026-03-03T00:00:00Z', totalKurus: 67000,  paidKurus: 67000, remainingKurus: 0,      agingDays: 47 },
    { id: 'pi-4', invoiceNumber: 'GID-2025-000187', contactId: 't-1', contactName: 'Yazıcı Kırtasiye Ltd.', issueDate: '2025-12-20T00:00:00Z', dueDate: '2026-01-19T00:00:00Z', totalKurus: 95000,  paidKurus: 20000, remainingKurus: 75000,  agingDays: 89 },
  ],
};

// ─── Veri yükleme ─────────────────────────────────────────────────────────────

async function fetchPayables(token: string): Promise<PayablesResponse> {
  return serverFetch<PayablesResponse>('financial', '/ar-ap/payables', token)
    .catch(() => DEMO);
}

// ─── Renk yardımcıları ────────────────────────────────────────────────────────

function agingColor(days: number): string {
  if (days === 0)  return 'text-emerald-400';
  if (days <= 30)  return 'text-sky-400';
  if (days <= 60)  return 'text-amber-400';
  if (days <= 90)  return 'text-orange-400';
  return 'text-rose-400';
}

function agingLabel(days: number): string {
  if (days === 0) return 'Vadesi Gelmedi';
  return `${days}g gecikmiş`;
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default async function BorclarPage() {
  const session = await getServerSession(authOptions);
  const { data, totalKurus, overdueKurus } = await fetchPayables(session?.user.accessToken ?? '');

  const notDueKurus  = totalKurus - overdueKurus;
  const overdueCount = data.filter((i) => i.agingDays > 0 && i.remainingKurus > 0).length;

  return (
    <div className="space-y-5">

      {/* ─── Geri + Başlık ─── */}
      <div>
        <Link href="/ar-ap" className="inline-flex items-center gap-1.5 text-xs text-text-3 hover:text-text-1 transition-colors mb-3">
          <ArrowLeft size={13} />
          {t('arAp.overview')}
        </Link>
        <h1 className="text-xl font-bold text-text-1 flex items-center gap-2">
          <TrendingDown size={20} className="text-rose-400" />
          {t('arAp.payables.title')}
        </h1>
        <p className="text-xs text-text-3 mt-0.5">{data.length} {t('arAp.payables.openInvoices')}</p>
      </div>

      {/* ─── Özet ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryChip icon={<TrendingDown size={14} />}  label={t('arAp.payables.totalPayables')}     value={formatCurrency(kurusToTl(totalKurus))}   color="rose" />
        <SummaryChip icon={<CheckCircle2 size={14} />}  label={t('arAp.payables.notDue')} value={formatCurrency(kurusToTl(notDueKurus))}  color="emerald" />
        <SummaryChip icon={<AlertCircle size={14} />}   label={t('arAp.payables.overduePayables')}   value={formatCurrency(kurusToTl(overdueKurus))} color={overdueKurus > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* ─── Gecikmiş uyarısı ─── */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
          <AlertCircle size={15} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{overdueCount} {t('arAp.payables.invoices')}</span> {t('arAp.payables.overdueWarning')}
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
                <th className="text-left pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.supplier')}</th>
                <th className="text-left pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.dueDate')}</th>
                <th className="text-right pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.total')}</th>
                <th className="text-right pb-2 pr-3 text-text-3 font-medium">{t('arAp.table.remaining')}</th>
                <th className="text-left pb-2 text-text-3 font-medium">{t('arAp.table.status')}</th>
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
                  <td className={`py-2.5 pr-3 text-right num font-semibold ${inv.remainingKurus === 0 ? 'text-text-3 line-through' : 'text-text-1'}`}>
                    {formatCurrency(kurusToTl(inv.remainingKurus))}
                  </td>
                  <td className="py-2.5">
                    {inv.remainingKurus === 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 size={10} />
                        {t('arAp.payables.paid')}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${agingColor(inv.agingDays)}`}>
                        {inv.agingDays > 0 ? <Clock size={10} /> : <CheckCircle2 size={10} />}
                        {agingLabel(inv.agingDays)}
                      </span>
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
