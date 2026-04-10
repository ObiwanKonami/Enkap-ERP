'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Plus, Check, X, AlertCircle, Loader2,
  ChevronRight, ExternalLink, CheckCircle2, XCircle,
  Banknote, Wallet, ClipboardCheck, Search
} from 'lucide-react';
import Link from 'next/link';
import {
  expenseApi,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_VARIANTS,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseReport,
  type ExpenseStatus,
} from '@/services/expense';
import { formatCurrency, formatDate, kurusToTl } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const LIMIT = 20;

const fmt = (k: number) => formatCurrency(kurusToTl(Number(k)));

function ExpenseRow({ report, onRefresh, onToast }: {
  report: ExpenseReport;
  onRefresh: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const qc = useQueryClient();

  const approveMut = useMutation({
    mutationFn: () => expenseApi.approve(report.id),
    onSuccess: () => {
      onToast(t('expense.approved'), 'success');
      onRefresh();
    },
    onError: () => {
      onToast(t('expense.actionError'), 'error');
    },
  });

  const EXPENSE_ITEMS: Array<{ label: string; value: string | number }> = [
    { label: t('common.totalAmount'), value: fmt(report.totalKurus) },
    { label: t('common.createdAt'), value: formatDate(report.createdAt) },
  ];

  return (
    <>
      <TableRow className="group hover:bg-muted/30 transition-colors">
        <TableCell className="w-10 pl-6">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center size-6 rounded hover:bg-muted transition-colors"
          >
            <ChevronRight size={14} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        </TableCell>
        <TableCell className="py-3 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{report.employeeName}</span>
            <span className="text-[10px] text-muted-foreground">{report.period}</span>
          </div>
        </TableCell>
        <TableCell className="px-4">
          <Badge variant={EXPENSE_STATUS_VARIANTS[report.status]} className="text-[9px] font-semibold uppercase tracking-wider">
            {t(`expense.filter.status.${report.status}`)}
          </Badge>
        </TableCell>
        <TableCell className="px-4 text-right">
          <span className="text-sm font-bold text-foreground tabular-nums">{fmt(report.totalKurus)}</span>
        </TableCell>
        <TableCell className="px-4 text-right">
          <span className="text-xs text-muted-foreground tabular-nums">{formatDate(report.createdAt)}</span>
        </TableCell>
        <TableCell className="pr-6 text-right">
          <div className="flex items-center justify-end gap-1">
            {report.status === 'ONAY_BEKLIYOR' && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => approveMut.mutate()}
                  disabled={approveMut.isPending}
                  title={t('expense.approve')}
                >
                  {approveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                </Button>
              </>
            )}
            {report.status === 'TASLAK' && (
              <>
                <Button size="icon" variant="ghost" className="size-7" asChild>
                  <Link href={`/masraf/${report.id}`}>
                    <ExternalLink size={14} />
                  </Link>
                </Button>
              </>
            )}
            {report.status === 'ONAYLANDI' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link href={`/masraf/${report.id}`}>
                  <ExternalLink size={12} className="mr-1" />
                  {t('common.view')}
                </Link>
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-muted/30 transition-colors bg-muted/5">
          <TableCell colSpan={6} className="py-4 px-6">
            <div className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
              {EXPENSE_ITEMS.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function MasrafClientPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const qc = useQueryClient();
  const { t } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function changeStatusFilter(v: string) { setStatusFilter(v); setPage(1); }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expense-reports', statusFilter, page, debouncedSearch],
    queryFn: () => expenseApi.list({ status: statusFilter || undefined, limit: LIMIT, offset: (page - 1) * LIMIT }).then(r => r.data),
    staleTime: 30_000,
  });

  const rawReports: ExpenseReport[] = Array.isArray(data) ? data : (data as { data?: ExpenseReport[] } | null)?.data ?? [];
  const totalRaw = (data as { total?: number } | null)?.total ?? 0;
  
  // Client-side search filter (backend doesn't support q parameter yet)
  const filteredReports = debouncedSearch
    ? rawReports.filter(r => 
        r.employeeName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        r.period.includes(debouncedSearch)
      )
    : rawReports;
  
  const reports = filteredReports;
  const total = debouncedSearch ? filteredReports.length : totalRaw;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const totalAmt = reports.reduce((s, r) => s + Number(r.totalKurus), 0);
  const pending  = reports.filter(r => r.status === 'ONAY_BEKLIYOR').length;
  const approved = reports.filter(r => r.status === 'ONAYLANDI').length;

  const STATUSES: ExpenseStatus[] = ['TASLAK', 'ONAY_BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI', 'ODENDI'];
  const STATUS_FILTER_ALL = "__ALL__";

  return (
    <div className="flex flex-col gap-6">
      {toast && (
        <Alert variant={toast.type === 'success' ? 'default' : 'destructive'} className="mb-0">
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <AlertDescription className="text-sm font-medium tracking-tight">{toast.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground shadow-sm">
            <Receipt size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('expense.title')}</h1>
        </div>
        <Button asChild className="h-9 gap-2 shadow-sm">
          <Link href="/masraf/yeni">
            <Plus size={16}/> 
            {t('expense.newReport')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <Banknote size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('expense.totalExpense')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {isLoading ? '—' : fmt(totalAmt)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <ClipboardCheck size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('expense.pendingApproval')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {isLoading ? '—' : String(pending)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-primary">
              <CheckCircle2 size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('expense.approvedExpense')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {isLoading ? '—' : String(approved)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <Receipt size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('common.total')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {isLoading ? '—' : String(total)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
          <Input
            placeholder={t('expense.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 bg-muted/40 border-border/50 shadow-none"
          />
        </div>
        <Select value={statusFilter} onValueChange={changeStatusFilter}>
          <SelectTrigger className="w-[200px] h-9 bg-muted/40 border-border text-sm font-medium shadow-none">
            <SelectValue placeholder={t('expense.filter.status.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>{t('expense.filter.status.all')}</SelectItem>
            {STATUSES.map(s => (
              <SelectItem key={s} value={s}>{t(`expense.filter.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-24 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-muted-foreground opacity-50"/>
            </div>
          ) : isError ? (
             <div className="py-12 px-6">
              <Alert variant="destructive">
                <AlertCircle size={16} className="mt-0" />
                <AlertDescription className="text-sm font-medium tracking-tight">{t('expense.loadError')}</AlertDescription>
              </Alert>
            </div>
          ) : reports.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-3">
              <Receipt size={48} className="text-muted-foreground opacity-20" />
              <p className="text-sm font-semibold tracking-widest uppercase text-muted-foreground opacity-40">{t('expense.noReports')}</p>
            </div>
          ) : (
            <div className="relative w-full overflow-auto grow min-h-0" style={{ scrollbarWidth: 'none' }}>
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow className="bg-muted/10 border-b border-border/50">
                    <TableHead className="w-10 pl-6"></TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider py-3 px-4">{t('expense.employeePeriod')}</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider px-4">{t('common.status')}</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider px-4 text-right">{t('common.totalAmount')}</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider px-4 text-right">{t('common.createdAt')}</TableHead>
                    <TableHead className="text-[10px] font-semibold uppercase tracking-wider pr-6 text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <ExpenseRow
                      key={r.id}
                      report={r}
                      onRefresh={() => {
                        refetch();
                        qc.invalidateQueries({ queryKey: ['expense-reports'] });
                      }}
                      onToast={showToast}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} {t("common.record")}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const n = start + i;
                if (n > totalPages) return null;
                return (
                  <PaginationItem key={n}>
                    <PaginationLink
                      href="#"
                      isActive={n === page}
                      onClick={(e) => { e.preventDefault(); setPage(n); }}
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
