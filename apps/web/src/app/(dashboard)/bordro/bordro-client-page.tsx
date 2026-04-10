'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  Wallet, TrendingUp, ShieldCheck, Building, ChevronLeft, ChevronRight,
  Calculator, CheckCheck, Mail, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { hrApi } from '@/services/hr';
import { apiClient } from '@/lib/api-client';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from '@/components/ui/data-table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buildBordroColumns, type BordroRow, type BordroStatus } from './bordro-table';
import { formatCurrency, kurusToTl } from '@/lib/format';
import { cn } from '@/lib/utils';

function normalizePayroll(raw: Record<string, unknown>): BordroRow {
  return {
    id: raw.id as string,
    employeeId: raw.employeeId as string,
    employeeName: raw.employeeName as string,
    grossSalaryKurus: (raw.grossSalaryKurus ?? raw.grossSalary ?? 0) as number,
    netSalaryKurus: (raw.netSalaryKurus ?? raw.netSalary ?? 0) as number,
    sgkEmployeeKurus: (raw.sgkEmployeeKurus ?? raw.sgkEmployee ?? 0) as number,
    sgkEmployerKurus: (raw.sgkEmployerKurus ?? raw.sgkEmployer ?? 0) as number,
    incomeTaxKurus: (raw.incomeTaxKurus ?? raw.incomeTax ?? 0) as number,
    stampTaxKurus: (raw.stampTaxKurus ?? raw.stampTax ?? 0) as number,
    status: raw.isApproved ? 'APPROVED' : 'PENDING',
    year: raw.year as number,
    month: raw.month as number,
  };
}

interface BordroClientPageProps {
  initialData?: BordroRow[];
  initialYear?: number;
  initialMonth?: number;
}

export function BordroClientPage({ initialData, initialYear, initialMonth }: BordroClientPageProps) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  
  const now = new Date();
  const [year, setYear] = useState(initialYear ?? parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10));
  const [month, setMonth] = useState(initialMonth ?? parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10));
  
  const [data, setData] = useState<BordroRow[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const y = parseInt(searchParams.get('year') ?? String(now.getFullYear()), 10);
    const m = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10);
    setYear(y);
    setMonth(m);
  }, [searchParams, now]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const response = await hrApi.payroll.get(year, month);
        const rawData = response.data as unknown as Record<string, unknown>[];
        const normalized = (rawData ?? []).map(normalizePayroll);
        setData(normalized);
      } catch (error) {
        console.error('Failed to fetch payroll:', error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [year, month]);

  const toplamBrut = data.reduce((s, e) => s + e.grossSalaryKurus, 0);
  const toplamNet = data.reduce((s, e) => s + e.netSalaryKurus, 0);
  const toplamSgkIsci = data.reduce((s, e) => s + e.sgkEmployeeKurus, 0);
  const toplamSgkIsveren = data.reduce((s, e) => s + e.sgkEmployerKurus, 0);

  const prevMonth = useCallback(() => {
    if (month === 1) {
      setYear(y => y - 1);
      setMonth(12);
    } else {
      setMonth(m => m - 1);
    }
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 12) {
      setYear(y => y + 1);
      setMonth(1);
    } else {
      setMonth(m => m + 1);
    }
  }, [month]);

  const handleDownloadSlip = async (params: { employeeId: string; employeeName: string; year: number; month: number }) => {
    setLoadingId(params.employeeId);
    try {
      const res = await hrApi.payroll.slip(params.employeeId, params.year, params.month);
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bordro-${params.employeeName.replace(/\s+/g, "-")}-${params.year}-${String(params.month).padStart(2, "0")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(`/api/hr/payroll/${params.employeeId}/${params.year}/${params.month}/slip`, "_blank");
    } finally {
      setLoadingId(null);
    }
  };

  async function run(action: "calculate" | "approve" | "send") {
    setActionLoading(action);
    setToast(null);
    try {
      await apiClient.post(
        `/hr/payroll/${year}/${month}/${action === "send" ? "send-payslips" : action}`,
        {},
      );
      const labels: Record<typeof action, string> = {
        calculate: t("hr.calculatedToast"),
        approve: t("hr.bulkApprovedToast"),
        send: t("hr.payslipsSentToast"),
      };
      setToast({ text: labels[action], ok: true });
      setTimeout(() => setToast(null), 4000);
      const response = await hrApi.payroll.get(year, month);
      const rawData = response.data as unknown as Record<string, unknown>[];
      setData((rawData ?? []).map(normalizePayroll));
    } catch {
      setToast({ text: t("hr.actionFailedToast"), ok: false });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setActionLoading(null);
    }
  }

  const columns = useMemo(() => buildBordroColumns(
    (key: string) => t(key),
    handleDownloadSlip,
    loadingId,
  ), [t, loadingId]);

  const monthName = t(`common.months.${month}`);
  const periodHeader = t("hr.periodHeader")
    .replace("{month}", monthName)
    .replace("{year}", String(year))
    .replace("{count}", String(data.length));

  const getPageUrl = (y: number, m: number) => `/bordro?year=${y}&month=${m}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground shadow-sm">
            <Wallet size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('hr.payrollManagement')}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => run("calculate")}
            disabled={actionLoading !== null}
            className="h-9 gap-2 font-bold shadow-none"
          >
            {actionLoading === "calculate" ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            {actionLoading === "calculate" ? t("hr.calculating") : t("hr.calculate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => run("approve")}
            disabled={actionLoading !== null}
            className="h-9 gap-2 font-bold shadow-none"
          >
            {actionLoading === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            {actionLoading === "approve" ? t("hr.approving") : t("hr.bulkApprove")}
          </Button>
          <Button
            size="sm"
            onClick={() => run("send")}
            disabled={actionLoading !== null}
            className="h-9 gap-2 font-bold shadow-sm"
          >
            {actionLoading === "send" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {actionLoading === "send" ? t("hr.sending") : t("hr.sendPayslips")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-9 rounded-lg hover:bg-primary/10">
            <Link href={getPageUrl(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)} aria-label={t("hr.prevMonth")}>
              <ChevronLeft size={20} />
            </Link>
          </Button>
          
          <div className="px-6 py-1.5 rounded-xl bg-muted border border-border shadow-sm min-w-[160px] text-center">
            <span className="text-sm font-bold text-foreground uppercase tracking-widest">
              {monthName} {year}
            </span>
          </div>

          <Button asChild variant="ghost" size="icon" className="size-9 rounded-lg hover:bg-primary/10">
            <Link href={getPageUrl(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)} aria-label={t("hr.nextMonth")}>
              <ChevronRight size={20} />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
              <div className="shrink-0 text-muted-foreground">
                <TrendingUp size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                  {t("hr.totalGross")}
                </p>
                <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                  {formatCurrency(kurusToTl(toplamBrut))}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
              <div className="shrink-0 text-muted-foreground">
                <Wallet size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                  {t("hr.totalNet")}
                </p>
                <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                  {formatCurrency(kurusToTl(toplamNet))}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
              <div className="shrink-0 text-muted-foreground">
                <ShieldCheck size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                  {t("hr.totalSgkWorker")}
                </p>
                <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                  {formatCurrency(kurusToTl(toplamSgkIsci))}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
              <div className="shrink-0 text-muted-foreground">
                <Building size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                  {t("hr.totalSgkEmployer")}
                </p>
                <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                  {formatCurrency(kurusToTl(toplamSgkIsveren))}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="py-3 px-6 border-b border-border/50 bg-muted/20">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{periodHeader}</span>
        </div>
        <CardContent className="p-0">
          {data.length === 0 && !isLoading ? (
            <div className="py-24 text-center text-muted-foreground text-sm font-medium uppercase">
              {t("hr.noPayrollData")}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={isLoading ? [] : data}
              showToolbar={false}
              showFooter={false}
              totalCount={data.length}
              page={1}
              serverLimit={data.length}
            />
          )}
        </CardContent>
      </Card>

      {toast && (
        <Alert 
          className={cn(
            "fixed bottom-6 right-6 z-[9999] w-auto min-w-[300px] shadow-2xl border-none backdrop-blur-md transition-all active:scale-95 group",
            toast.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          )}
        >
          <AlertTitle className="hidden">Bildirim</AlertTitle>
          <div className="flex items-center gap-3">
            {toast.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <AlertDescription className="text-sm font-bold tracking-tight">
              {toast.text}
            </AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  );
}
