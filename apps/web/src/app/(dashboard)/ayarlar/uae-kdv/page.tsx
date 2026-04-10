'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Globe, CheckCircle, XCircle, Calculator, TrendingDown, CheckCircle2 } from 'lucide-react';
import { uaeApi, UaeVatCategory, UaeVatCalculation, UaeVatLine, TrnValidationResult, UaeVatPeriodSummary } from '@/services/uae';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<UaeVatCategory, string> = {
  STANDARD: 'Standart (%5)',
  ZERO:     'Sıfır Oranlı (%0)',
  EXEMPT:   'Muaf',
};

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

// ─── TRN Doğrulama ────────────────────────────────────────────────────────────

function TrnValidator() {
  const [trn, setTrn] = useState('');
  const [result, setResult] = useState<TrnValidationResult | null>(null);

  const validate = useMutation({
    mutationFn: () => uaeApi.validateTrn(trn),
    onSuccess: (data) => setResult(data.data),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CheckCircle size={14} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">TRN Doğrulama</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">BAE Vergi Kayıt Numarası (Tax Registration Number) doğrulama</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            value={trn}
            onChange={e => setTrn(e.target.value)}
            placeholder="100000000000001"
            maxLength={15}
            className="flex-1"
          />
          <Button
            onClick={() => validate.mutate()}
            disabled={trn.length < 10 || validate.isPending}
            isLoading={validate.isPending}
          >
            Doğrula
          </Button>
        </div>

        {result && (
          <div className={cn(
            'flex items-start gap-3 p-3 rounded-lg border',
            result.isValid
              ? 'bg-primary/10 border-primary/20'
              : 'bg-destructive/10 border-destructive/20',
          )}>
            {result.isValid
              ? <CheckCircle size={16} className="text-primary shrink-0 mt-0.5" />
              : <XCircle size={16} className="text-destructive shrink-0 mt-0.5" />
            }
            <div>
              <p className={cn('text-sm font-medium', result.isValid ? 'text-primary' : 'text-destructive')}>
                {result.isValid ? 'Geçerli TRN' : 'Geçersiz TRN'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{result.trn}</p>
              {result.errorMsg && <p className="text-xs text-destructive mt-1">{result.errorMsg}</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── KDV Hesaplama ────────────────────────────────────────────────────────────

function VatCalculator() {
  const [lines, setLines] = useState([
    { description: '', quantity: 1, unitPrice: 0, vatCategory: 'STANDARD' as UaeVatCategory },
  ]);
  const [result, setResult] = useState<UaeVatCalculation | null>(null);

  const calc = useMutation({
    mutationFn: () => uaeApi.calculateVat({ lines }),
    onSuccess: (data) => setResult(data.data),
  });

  function addLine() {
    setLines(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, vatCategory: 'STANDARD' }]);
  }

  function updateLine(i: number, field: string, value: string | number) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calculator size={14} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">KDV Hesaplama</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">BAE KDV (%5 standart) detaylı hesaplama</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-4 text-sm"
                value={line.description}
                onChange={e => updateLine(i, 'description', e.target.value)}
                placeholder="Açıklama"
              />
              <Input
                type="number"
                className="col-span-2 text-sm "
                value={line.quantity}
                onChange={e => updateLine(i, 'quantity', Number(e.target.value))}
                placeholder="Adet"
                min={1}
              />
              <Input
                type="number"
                className="col-span-2 text-sm "
                value={line.unitPrice || ''}
                onChange={e => updateLine(i, 'unitPrice', Number(e.target.value))}
                placeholder="Birim fiyat"
              />
              <Select
                value={line.vatCategory}
                onValueChange={v => updateLine(i, 'vatCategory', v)}
              >
                <SelectTrigger className="col-span-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as UaeVatCategory[]).map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="col-span-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 size-8"
                onClick={() => removeLine(i)}
                disabled={lines.length === 1}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addLine}>+ Satır Ekle</Button>
          <Button size="sm" onClick={() => calc.mutate()} disabled={calc.isPending} isLoading={calc.isPending}>
            Hesapla
          </Button>
        </div>

        {result && (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Açıklama</TableHead>
                  <TableHead className="text-xs text-right">Tutar</TableHead>
                  <TableHead className="text-xs text-right">KDV</TableHead>
                  <TableHead className="text-xs text-right">Toplam</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.lines?.map((l: UaeVatLine, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{l.description || '—'}</TableCell>
                    <TableCell className="text-right text-sm">AED {l.lineTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">AED {l.vatAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">AED {(l.lineTotal + l.vatAmount).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot className="border-t border-border bg-muted/30">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-xs text-muted-foreground text-right">KDV Toplamı:</td>
                  <td className="px-4 py-2 text-right text-sm text-muted-foreground font-medium">AED {result.totalVat?.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-foreground">AED {result.grandTotal?.toFixed(2)}</td>
                </tr>
              </tfoot>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Dönem KDV Özeti ──────────────────────────────────────────────────────────

function PeriodSummary() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<UaeVatPeriodSummary | null>(null);

  const fetch = useMutation({
    mutationFn: () => uaeApi.periodSummary({ year, month }),
    onSuccess: (data) => setSummary(data.data),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingDown size={14} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Dönem KDV Özeti</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Aylık KDV beyanı için özet</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Yıl</Label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Ay</Label>
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => fetch.mutate()} disabled={fetch.isPending} isLoading={fetch.isPending}>
            Getir
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Standart Oranlı Satış', value: summary.standardRatedSales, accent: false },
              { label: 'Sıfır Oranlı Satış',    value: summary.zeroRatedSales,     accent: false },
              { label: 'Muaf Satış',             value: summary.exemptSales,        accent: false },
              { label: 'Tahsil Edilen KDV',      value: summary.totalVatCollected,  accent: true  },
              { label: 'Ödenen KDV (Gider)',     value: summary.totalVatPaid,       accent: false, destructive: true },
              { label: 'Net Ödenecek KDV',       value: summary.netVatPayable,      accent: false },
            ].map(({ label, value, accent, destructive }) => (
              <div key={label} className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn(
                  'text-lg font-bold mt-1',
                  accent ? 'text-primary' : destructive ? 'text-destructive' : 'text-foreground',
                )}>
                  {summary.currency} {value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function UaeKdvPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <Globe size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">BAE KDV (UAE VAT)</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Federal Tax Authority — TRN doğrulama, KDV hesaplama ve dönem özeti</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-xs">UAE FTA</Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TrnValidator />
        <PeriodSummary />
      </div>

      <VatCalculator />
    </div>
  );
}
