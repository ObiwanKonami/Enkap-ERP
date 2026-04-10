'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, RefreshCw, Plus, TrendingUp, TrendingDown,
  Minus, History, Landmark, CalendarDays,
} from 'lucide-react';
import { currencyApi, CurrencyCode, CURRENCY_LABELS, CURRENCY_FLAGS } from '@/services/currency';
import { formatDate, formatDateTime } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DateInput } from '@/components/ui/date-input';
import { cn } from '@/lib/utils';

// ─── Manuel Kur Modal ─────────────────────────────────────────────────────────

function ManualRateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyRate, setBuyRate] = useState('');
  const [sellRate, setSellRate] = useState('');

  const save = useMutation({
    mutationFn: () => currencyApi.manualRate({
      currency,
      date,
      buyRate:  parseFloat(buyRate),
      sellRate: parseFloat(sellRate),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currency-current'] });
      qc.invalidateQueries({ queryKey: ['currency-history'] });
      onSaved();
      onClose();
    },
  });

  const currencies: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'CHF', 'JPY'];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground w-fit mb-2">
            <Plus size={18} />
          </div>
          <DialogTitle className="text-lg font-semibold">Manuel Kur Gir</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sistem dışı kur değerlerini el ile yapılandırın
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Para Birimi</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map(c => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_FLAGS[c] ?? '💱'} {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Tarih</Label>
              <DateInput
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Alış Kuru (₺)</Label>
              <Input
                type="number"
                step="0.0001"
                placeholder="0.0000"
                value={buyRate}
                onChange={e => setBuyRate(e.target.value)}
                className=""
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Satış Kuru (₺)</Label>
              <Input
                type="number"
                step="0.0001"
                placeholder="0.0000"
                value={sellRate}
                onChange={e => setSellRate(e.target.value)}
                className=""
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>İptal</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!buyRate || !sellRate || save.isPending}
            isLoading={save.isPending}
          >
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function DovizKurlariPage() {
  const qc = useQueryClient();
  const [showManual, setShowManual] = useState(false);
  const { t } = useI18n();

  const { data: currentRes, isLoading } = useQuery({
    queryKey: ['currency-current'],
    queryFn:  () => currencyApi.getCurrentRates().then(r => r.data),
    staleTime: 60_000,
  });

  const { data: historyRes } = useQuery({
    queryKey: ['currency-history'],
    queryFn:  () => currencyApi.getRates().then(r => r.data),
    staleTime: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => currencyApi.refresh(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currency-current'] });
      qc.invalidateQueries({ queryKey: ['currency-history'] });
    },
  });

  const current     = currentRes;
  const historyList = (historyRes as { data: unknown[] } | null)?.data
    ?? (Array.isArray(historyRes) ? historyRes : []);

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Başlık */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <DollarSign size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Döviz Kurları</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Güncel ve geçmiş kur verileri</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowManual(true)} className="gap-2">
            <Plus size={15} />
            Manuel Gir
          </Button>
          <Button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            isLoading={refresh.isPending}
            className="gap-2"
          >
            <RefreshCw size={15} className={cn(refresh.isPending && 'animate-spin')} />
            TCMB&apos;den Güncelle
          </Button>
        </div>
      </div>

      {/* Son güncelleme */}
      {current?.date && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
          <CalendarDays size={13} />
          <span>Son güncelleme: <span className="text-foreground font-medium">{formatDate(current.date)}</span></span>
          <Separator orientation="vertical" className="h-3 mx-1" />
          <Badge variant="secondary" className="text-[10px] h-5">Live Feed</Badge>
        </div>
      )}

      {/* Güncel Kurlar Gridi */}
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Piyasa Özeti (₺)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {isLoading ? (
            [1, 2, 3, 4, 5].map(i => (
              <Card key={i} className="h-36 animate-pulse bg-muted/20" />
            ))
          ) : !current?.rates?.length ? (
            <Card className="col-span-full py-20 flex flex-col items-center justify-center text-center border-dashed">
              <Landmark size={40} className="mb-4 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">Henüz kur verisi mevcut değil</p>
              <p className="text-xs text-muted-foreground mt-1">TCMB güncellemesini başlatın</p>
            </Card>
          ) : (
            current.rates.map(rate => {
              const flag  = CURRENCY_FLAGS[rate.currency as CurrencyCode] ?? '💱';
              const label = CURRENCY_LABELS[rate.currency as CurrencyCode] ?? rate.currency;
              const change = rate.change ?? 0;
              const ChangeIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
              const changeColor = change > 0 ? 'text-primary' : change < 0 ? 'text-destructive' : 'text-muted-foreground';

              return (
                <Card key={rate.currency} className="shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{flag}</span>
                        <div className="flex flex-col">
                          <CardTitle className="text-sm font-bold">{rate.currency}</CardTitle>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{label}</span>
                        </div>
                      </div>
                      <Badge
                        variant={rate.source === 'TCMB' ? 'secondary' : 'outline'}
                        className="text-[9px] h-5 self-start"
                      >
                        {rate.source}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Alış</span>
                        <span className="text-sm font-medium">₺{rate.buyRate.toFixed(4)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Satış</span>
                        <span className="text-sm font-medium">₺{rate.sellRate.toFixed(4)}</span>
                      </div>
                    </div>
                    <Separator />
                    <div className={cn('flex items-center justify-end gap-1 text-[10px] font-medium', changeColor)}>
                      <ChangeIcon size={11} />
                      {Math.abs(change).toFixed(2)}%
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Kur Geçmişi Tablosu */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Geçmiş Veriler</CardTitle>
          </div>
          <Badge variant="secondary" className="text-[10px]">Son 50 Kayıt</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-3 pl-6">İşlem Tarihi</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-3">Para Birimi</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-3 text-right">Alış Kuru (₺)</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-3 text-right">Satış Kuru (₺)</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-3 pr-6">Kaynak</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <History size={28} className="text-muted-foreground opacity-30" />
                        <span className="text-xs text-muted-foreground">Kur geçmişi bulunamadı</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (historyList as any[]).slice(0, 50).map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/50">
                      <TableCell className="pl-6">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(row.date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{CURRENCY_FLAGS[row.currency as CurrencyCode] ?? '💱'}</span>
                          <span className="text-sm font-medium">{row.currency}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums">₺{Number(row.buyRate).toFixed(4)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums">₺{Number(row.sellRate).toFixed(4)}</span>
                      </TableCell>
                      <TableCell className="pr-6">
                        <Badge
                          variant={row.source === 'TCMB' ? 'secondary' : 'outline'}
                          className="text-[10px] h-5"
                        >
                          {row.source}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ManualRateModal
        open={showManual}
        onClose={() => setShowManual(false)}
        onSaved={() => {}}
      />
    </div>
  );
}
