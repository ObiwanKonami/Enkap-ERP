'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { hrApi } from '@/services/hr';
import { formatCurrency, kurusToTl } from '@/lib/format';
import {
  ShieldCheck, Download, Loader2, AlertCircle, Info,
  ChevronLeft, ChevronRight, Users, Banknote, Receipt, FileCode,
} from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SgkEmployeeRow {
  employeeId:   string;
  firstName:    string;
  lastName:     string;
  tckn:         string;
  grossSalary:  number;
  sgkEmployee:  number;
  sgkEmployer:  number;
  incomeTax:    number;
  stampTax:     number;
  netSalary:    number;
}

interface SgkBildirge {
  year:             number;
  month:            number;
  workplaceCode:    string;
  employeeCount:    number;
  totalGross:       number;
  totalSgkWorker:   number;
  totalSgkEmployer: number;
  totalTax:         number;
  grandTotal:       number;
  employees:        SgkEmployeeRow[];
}

function getMonthNames(t: any): string[] {
  return [
    t('sgk.january'), t('sgk.february'), t('sgk.march'), t('sgk.april'),
    t('sgk.may'), t('sgk.june'), t('sgk.july'), t('sgk.august'),
    t('sgk.september'), t('sgk.october'), t('sgk.november'), t('sgk.december'),
  ];
}

function maskTckn(t: string) {
  if (!t || t.length < 5) return t;
  return `${t.slice(0, 3)}${'*'.repeat(6)}${t.slice(-2)}`;
}

function fmt(kurus: number) {
  return formatCurrency(kurusToTl(kurus));
}

export default function SgkPage() {
  const { t } = useI18n();
  const months = getMonthNames(t);
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [hoverRow, setHoverRow] = useState<string | null>(null);

  const { data: raw, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sgk-bildirge', year, month],
    queryFn: () => hrApi.sgk.bildirge(year, month).then((r: { data: SgkBildirge }) => r.data),
    staleTime: 60_000,
    retry: false,
  });

  const errStatus = (error as AxiosError | null)?.response?.status;
  const errMsg    = ((error as AxiosError<{ message?: string }>| null)?.response?.data?.message)
    ?? (error as Error | null)?.message;

  const bildirge: SgkBildirge = raw ?? {
    year, month, workplaceCode: '—', employeeCount: 0,
    totalGross: 0, totalSgkWorker: 0, totalSgkEmployer: 0,
    totalTax: 0, grandTotal: 0, employees: [],
  };

  const { mutate: downloadXml, isPending: isDownloading } = useMutation({
    mutationFn: () => hrApi.sgk.bildirgeXml(year, month),
    onSuccess: (res: { data: Blob }) => {
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `sgk-bildirge-${year}-${String(month).padStart(2, '0')}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    const atLimit = year > now.getFullYear() ||
      (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (atLimit) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }
  const atCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 size={22} className="animate-spin text-muted-foreground"/>
      </div>
    );
  }

  if (isError) {
    if (errStatus === 404) {
      return (
        <div className="flex flex-col gap-6">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck size={20} className="text-muted-foreground"/> {t('sgk.title')}
          </h1>
          <Alert>
            <Info size={15} />
            <AlertDescription>{errMsg ?? t('sgk.noApprovedPayroll')}</AlertDescription>
          </Alert>
        </div>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertCircle size={15}/>
        <AlertDescription className="flex items-center gap-2">
          {errMsg ?? t('sgk.connectionError')}
          <button onClick={() => refetch()} className="text-sm underline ml-2">
            {t('common.retry')}
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck size={20} className="text-muted-foreground"/> {t('sgk.title')}
        </h1>
        <Button onClick={() => downloadXml()} disabled={isDownloading} isLoading={isDownloading}>
          {isDownloading ? <Loader2 size={14} className="animate-spin mr-1.5"/> : <Download size={14} className="mr-1.5"/>}
          {t('sgk.downloadXml')}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft size={15}/>
        </Button>
        <Card className="px-5 py-2 text-center min-w-[170px]">
          <p className="text-sm font-semibold">{months[month - 1]} {year}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {t('sgk.workplaceCode')}: {bildirge.workplaceCode}
          </p>
        </Card>
        <Button variant="outline" size="icon" onClick={nextMonth} disabled={atCurrent}>
          <ChevronRight size={15}/>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-muted-foreground"/>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('sgk.insuredCount')}
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{bildirge.employeeCount}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-2">
              <Banknote size={16} className="text-muted-foreground"/>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('sgk.totalGross')}
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{fmt(bildirge.totalGross)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-2">
              <Receipt size={16} className="text-muted-foreground"/>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('sgk.totalSgk')}
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{fmt(bildirge.totalSgkWorker + bildirge.totalSgkEmployer)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={16} className="text-muted-foreground"/>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('sgk.totalCost')}
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{fmt(bildirge.grandTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCode size={13} className="text-muted-foreground"/>
            {t('sgk.premiumDistribution')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('sgk.totalGross')}</span>
              <span className="text-sm font-semibold tabular-nums">{fmt(bildirge.totalGross)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('sgk.sgkEmployeeShare')}</span>
              <span className="text-sm font-semibold tabular-nums">{fmt(bildirge.totalSgkWorker)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('sgk.sgkEmployerShare')}</span>
              <span className="text-sm font-semibold tabular-nums">{fmt(bildirge.totalSgkEmployer)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('sgk.incomeTax')}</span>
              <span className="text-sm font-semibold tabular-nums">{fmt(bildirge.totalTax)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('sgk.stampTax')}</span>
              <span className="text-sm font-semibold tabular-nums">{fmt(Math.round(bildirge.totalGross * 0.00759))}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('sgk.totalEmployerCost')}</span>
              <span className="text-sm font-bold tabular-nums text-primary">{fmt(bildirge.grandTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="py-4 px-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-muted-foreground"/>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">
              {t('sgk.insuredList')}
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] h-5">
              {bildirge.employees.length} {t('sgk.employees')}
            </Badge>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t('sgk.fullName')}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t('sgk.idNumber')}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t('sgk.grossSalary')}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t('sgk.sgkEmployee')}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t('sgk.sgkEmployer')}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t('sgk.incomeTaxShort')}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t('sgk.netSalary')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bildirge.employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('sgk.noRecordsFound')}
                  </TableCell>
                </TableRow>
              ) : bildirge.employees.map((emp) => (
                <TableRow
                  key={emp.employeeId}
                  className="hover:bg-muted/30 transition-colors"
                  onMouseEnter={() => setHoverRow(emp.employeeId)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  <TableCell className="font-medium">{emp.firstName} {emp.lastName}</TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{maskTckn(emp.tckn)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(emp.grossSalary)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(emp.sgkEmployee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(emp.sgkEmployer)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(emp.incomeTax)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">{fmt(emp.netSalary)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {bildirge.employees.length > 0 && (
              <TableFooter>
                <TableRow className="bg-muted/30 border-t-2">
                  <TableCell colSpan={2} className="font-semibold uppercase tracking-wider text-muted-foreground">{t('common.total')}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmt(bildirge.totalGross)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmt(bildirge.totalSgkWorker)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmt(bildirge.totalSgkEmployer)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-muted-foreground">{fmt(bildirge.totalTax)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-primary">{fmt(bildirge.employees.reduce((s, e) => s + e.netSalary, 0))}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
        <div className="m-4 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-primary">{t('sgk.info')}: </span>
          {t('sgk.infoText')}
          <span className="font-medium">{t('sgk.ebildir')}</span>
          {t('sgk.ratesText')}
        </div>
      </Card>
    </div>
  );
}