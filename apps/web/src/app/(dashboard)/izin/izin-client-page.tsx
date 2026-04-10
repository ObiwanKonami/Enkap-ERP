'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { 
  CalendarDays, AlertTriangle, Clock, CheckCircle2, XCircle, Plus,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search
} from 'lucide-react';
import { hrApi } from '@/services/hr';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataTable } from '@/components/ui/data-table';
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildIzinColumns, type IzinRow } from './izin-table';
import type { LeaveRequest } from '@/services/hr';

const LIMIT = 20;

function normalizeLeave(raw: LeaveRequest): IzinRow {
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    employeeName: raw.employeeName,
    leaveType: raw.leaveType,
    startDate: raw.startDate,
    endDate: raw.endDate,
    days: raw.days,
    reason: raw.reason,
    status: raw.status,
  };
}

interface IzinClientPageProps {
  initialData?: {
    items: IzinRow[];
    total: number;
    page: number;
    limit: number;
  };
}

export function IzinClientPage({ initialData }: IzinClientPageProps) {
  const { t } = useI18n();
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? LIMIT);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState<IzinRow[]>(initialData?.items ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.total ?? 0);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // @ts-expect-error - search parameter not yet supported by backend
        const response = await hrApi.leave.pending({ page, limit, q: debouncedSearch || undefined });
        const result = response.data;
        const items: IzinRow[] = (result?.items ?? []).map(normalizeLeave);
        setData(items);
        setTotalCount(result?.total ?? 0);
      } catch (error) {
        console.error('Failed to fetch leave requests:', error);
        setData([]);
        setTotalCount(0);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [page, limit, debouncedSearch]);

  const pageCount = Math.max(1, Math.ceil(totalCount / limit));

  const bekleyen = data.filter(r => r.status === 'pending').length;
  const onaylanan = data.filter(r => r.status === 'approved').length;
  const reddedilen = data.filter(r => r.status === 'rejected').length;

  const handleApprove = useCallback(async (id: string) => {
    setPendingActionId(id);
    try {
      await hrApi.leave.approve(id, { approved: true });
      const response = await hrApi.leave.pending({ page, limit });
      const result = response.data;
      const items: IzinRow[] = (result?.items ?? []).map(normalizeLeave);
      setData(items);
      setTotalCount(result?.total ?? 0);
    } catch (error) {
      console.error('Failed to approve leave:', error);
    } finally {
      setPendingActionId(null);
    }
  }, [page, limit]);

  const handleReject = useCallback(async (id: string) => {
    setPendingActionId(id);
    try {
      await hrApi.leave.approve(id, { approved: false });
      const response = await hrApi.leave.pending({ page, limit });
      const result = response.data;
      const items: IzinRow[] = (result?.items ?? []).map(normalizeLeave);
      setData(items);
      setTotalCount(result?.total ?? 0);
    } catch (error) {
      console.error('Failed to reject leave:', error);
    } finally {
      setPendingActionId(null);
    }
  }, [page, limit]);

  const columns = useMemo(() => buildIzinColumns(
    (key: string) => t(key),
    handleApprove,
    handleReject,
    pendingActionId,
  ), [t, handleApprove, handleReject, pendingActionId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground shadow-sm">
            <CalendarDays size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('hr.leaveRequests')}</h1>
        </div>
        <Button asChild className="h-9 gap-2 shadow-sm">
          <Link href="/izin/yeni">
            <Plus size={16}/>
            {t('hr.newLeaveRequest')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <Clock size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('hr.pendingLeave')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {bekleyen}
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
                {t('hr.approvedLeave')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {onaylanan}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-destructive">
              <XCircle size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('hr.rejectedLeave')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {reddedilen}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <CalendarDays size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('common.total')}
              </p>
              <p className="text-xl font-bold tracking-tight tabular-nums leading-none">
                {totalCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
          <Input
            placeholder={t('hr.searchLeave') || 'Çalışan adı veya izin türü...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 bg-muted/40 border-border/50 shadow-none"
          />
        </div>
      </div>

      {bekleyen > 0 && (
        <Alert className="bg-destructive/10 border-destructive/25 text-destructive flex items-center gap-3 h-12 shadow-sm">
          <AlertTriangle size={15} className="shrink-0 mb-0.5" />
          <AlertDescription className="text-sm font-medium leading-none">
            <strong>{bekleyen} {t('hr.pendingLeave').toLowerCase()} {t('hr.leaveRequests').toLowerCase()}</strong> {t('hr.pendingWarning')}
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {data.length === 0 && !isLoading ? (
            <div className="py-24 flex flex-col items-center gap-3">
              <CalendarDays size={48} className="text-muted-foreground opacity-20" />
              <p className="text-sm font-semibold tracking-widest uppercase text-muted-foreground opacity-40">İzin talebi bulunamadı.</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={isLoading ? [] : data}
              showToolbar={false}
              showFooter={false}
              totalCount={totalCount}
              page={page}
              serverLimit={limit}
            />
          )}
        </CardContent>
      </Card>

      {totalCount > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {Math.min((page - 1) * limit + 1, totalCount)}–{Math.min(page * limit, totalCount)} {t("common.record")}
          </span>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('common.pageLimit') || 'Sayfa başı'}</span>
              <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[70px] bg-muted/40 text-xs shadow-none border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                {page} / {pageCount}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page <= 1} onClick={() => setPage(1)}>
                  <ChevronsLeft size={16}/>
                </Button>
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16}/>
                </Button>
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={16}/>
                </Button>
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page >= pageCount} onClick={() => setPage(pageCount)}>
                  <ChevronsRight size={16}/>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
