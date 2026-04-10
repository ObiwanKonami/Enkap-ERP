'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, UserCheck, Coffee, UserX, Plus, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { hrApi } from '@/services/hr';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalisanRow, buildCalisanlarColumns } from './calisanlar-table';
import { cn } from '@/lib/utils';

const STATUS_FILTER_ALL = "__ALL__";

interface CalisanClientPageProps {
  initialData?: {
    data: CalisanRow[];
    total: number;
  };
}

export function CalisanClientPage({ initialData }: CalisanClientPageProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_FILTER_ALL);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<CalisanRow[]>(initialData?.data ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.total ?? 0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const response = await hrApi.employees.list({
          limit,
          page,
          search: debouncedSearch || undefined,
          status: statusFilter === STATUS_FILTER_ALL ? undefined : statusFilter as 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED',
        });
        const result = response.data;
        const employees: CalisanRow[] = (result?.data ?? []).map(e => ({
          id: e.id,
          sicilNo: e.sicilNo,
          firstName: e.firstName,
          lastName: e.lastName,
          tckn: e.tckn ?? '',
          department: e.department ?? '',
          title: e.title ?? '',
          startDate: e.startDate,
          baseSalaryKurus: e.baseSalaryKurus,
          status: e.status,
        }));
        setData(employees);
        setTotalCount(result?.total ?? 0);
      } catch (error) {
        console.error('Failed to fetch employees:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [debouncedSearch, statusFilter, page, limit]);

  const pageCount = Math.max(1, Math.ceil(totalCount / limit));

  const aktifSayisi = data.filter(e => e.status === 'ACTIVE').length;
  const izindeSayisi = data.filter(e => e.status === 'ON_LEAVE').length;
  const ayrilanSayisi = data.filter(e => e.status === 'TERMINATED').length;

  const columns = buildCalisanlarColumns((key: string) => t(key));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground shadow-sm">
            <Users size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('hr.employeeManagement')}</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {totalCount} {t('hr.employeesRegistered')}
            </p>
          </div>
        </div>
        <Button asChild className="h-9 gap-2 shadow-sm">
          <Link href="/calisanlar/yeni">
            <Plus size={16} />
            {t('hr.newEmployee')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm flex-1">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('hr.totalEmployees')}
              </p>
              <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                {totalCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-primary">
              <UserCheck size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('hr.status.active')}
              </p>
              <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                {aktifSayisi}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-muted-foreground">
              <Coffee size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('hr.status.onLeave')}
              </p>
              <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                {izindeSayisi}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1">
          <CardContent className="pt-5 pb-4 px-6 flex items-center gap-4">
            <div className="shrink-0 text-destructive">
              <UserX size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-none mb-1.5 text-muted-foreground">
                {t('hr.status.TERMINATED')}
              </p>
              <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                {ayrilanSayisi}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <Input
            placeholder={t('hr.searchEmployee') || 'Ad, soyad, sicil veya TCKN ara…'}
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 bg-muted/40"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] h-9 bg-muted/40">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>{t('common.all')}</SelectItem>
            <SelectItem value="ACTIVE">{t('hr.status.active')}</SelectItem>
            <SelectItem value="ON_LEAVE">{t('hr.status.onLeave')}</SelectItem>
            <SelectItem value="TERMINATED">{t('hr.status.TERMINATED')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-sm border-none bg-card/50 overflow-hidden">
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={isLoading ? [] : data}
            showToolbar={false}
            showFooter={false}
            totalCount={totalCount}
            page={page}
            serverLimit={limit}
          />
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
