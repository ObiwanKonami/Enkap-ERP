'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, UserCheck, Truck, UserPlus, Plus, Search, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { crmApi } from '@/services/crm';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { MusteriRow, buildMusteriColumns } from './musteri-table';
import { cn } from '@/lib/utils';

const TYPE_FILTER_ALL = "__ALL__";

interface MusteriClientPageProps {
  initialData?: {
    data: MusteriRow[];
    total: number;
  };
}

export function MusteriClientPage({ initialData }: MusteriClientPageProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(TYPE_FILTER_ALL);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<MusteriRow[]>(initialData?.data ?? []);
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
  }, [typeFilter]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const response = await crmApi.contacts.list({
          limit,
          page,
          search: debouncedSearch || undefined,
          type: typeFilter === TYPE_FILTER_ALL ? undefined : typeFilter as 'customer' | 'vendor' | 'both' | 'prospect',
        });
        const result = response.data;
        setData(result?.data ?? []);
        setTotalCount(result?.total ?? 0);
      } catch (error) {
        console.error('Failed to fetch contacts:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [debouncedSearch, typeFilter, page, limit]);

  const pageCount = Math.max(1, Math.ceil(totalCount / limit));

  const musteriSayisi = data.filter(c => c.type === 'customer' || c.type === 'both').length;
  const tedarikciSayisi = data.filter(c => c.type === 'vendor' || c.type === 'both').length;
  const adaySayisi = data.filter(c => c.type === 'prospect').length;

  const columns = buildMusteriColumns((key: string) => t(key));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Users size={24} className="text-primary"/> {t('crm.contacts')}
        </h1>
        <Button asChild className="h-9 gap-2 shadow-sm">
          <Link href="/musteri/yeni">
            <Plus size={16}/> {t('common.new')} {t('common.record')}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('common.total'), value: totalCount, icon: <Users size={16}/>, cls: "text-primary" },
          { label: t('crm.customerCount'), value: musteriSayisi, icon: <UserCheck size={16}/>, cls: "text-primary" },
          { label: t('crm.vendorCount'), value: tedarikciSayisi, icon: <Truck size={16}/>, cls: "text-primary" },
          { label: t('crm.prospectCount'), value: adaySayisi, icon: <UserPlus size={16}/>, cls: "text-muted-foreground" },
        ].map(k => (
          <Card key={k.label} className="shadow-sm border border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={cn("p-2 rounded-lg bg-muted", k.cls)}>
                  {k.icon}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</div>
              </div>
              <div className={cn("text-3xl font-bold tracking-tight", k.cls)}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <Input
            placeholder={t('crm.contacts') + ', e-posta veya şehir ara…'}
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 bg-muted/40"
          />
        </div>
        
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9 bg-muted/40">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_FILTER_ALL}>{t('common.all')}</SelectItem>
            <SelectItem value="customer">{t('crm.contactType.CUSTOMER')}</SelectItem>
            <SelectItem value="vendor">{t('crm.contactType.VENDOR')}</SelectItem>
            <SelectItem value="both">{t('crm.contactType.BOTH')}</SelectItem>
            <SelectItem value="prospect">{t('crm.contactType.PROSPECT')}</SelectItem>
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
            {Math.min((page - 1) * limit + 1, totalCount)}–{Math.min(page * limit, totalCount)} / {totalCount} kayıt
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
