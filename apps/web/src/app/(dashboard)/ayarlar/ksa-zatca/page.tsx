'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Shield, QrCode, FileCheck, Calculator, Key, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { ksaApi, ZatcaSubmissionResult, ZakatResult } from '@/services/ksa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ─── Status Renkleri ──────────────────────────────────────────────────────────

type StatusKey = 'REPORTED' | 'CLEARED' | 'REJECTED' | 'PENDING';

const STATUS_CONFIG: Record<StatusKey, {
  label: string;
  className: string;
  icon: typeof CheckCircle;
}> = {
  REPORTED: { label: 'Raporlandı',  className: 'text-muted-foreground', icon: CheckCircle },
  CLEARED:  { label: 'Onaylandı',   className: 'text-primary',          icon: CheckCircle },
  REJECTED: { label: 'Reddedildi',  className: 'text-destructive',      icon: XCircle     },
  PENDING:  { label: 'Bekliyor',    className: 'text-muted-foreground', icon: AlertCircle },
};

// ─── Fatura Gönder / Onayla ───────────────────────────────────────────────────

function InvoiceActions() {
  const [invoiceId, setInvoiceId] = useState('');
  const [mode, setMode] = useState<'report' | 'clear' | null>(null);
  const [result, setResult] = useState<ZatcaSubmissionResult | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const report = useMutation({
    mutationFn: () => ksaApi.reportZatca(invoiceId),
    onSuccess: (data) => { setResult(data.data); setMode('report'); },
  });

  const clear = useMutation({
    mutationFn: () => ksaApi.clearZatca(invoiceId),
    onSuccess: (data) => { setResult(data.data); setMode('clear'); },
  });

  const generateQr = useMutation({
    mutationFn: () => ksaApi.generateQr(invoiceId),
    onSuccess: (data) => setQrCode(data.data.qrCode),
  });

  const busy = report.isPending || clear.isPending || generateQr.isPending;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileCheck size={14} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Fatura Gönder / Onayla</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Fatura ID ile ZATCA&apos;ya B2B (clearance) veya B2C (reporting) bildirimi
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input
          value={invoiceId}
          onChange={e => setInvoiceId(e.target.value)}
          placeholder="Fatura ID (UUID)"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => report.mutate()}
            disabled={!invoiceId || busy}
            isLoading={report.isPending}
          >
            B2C Raporla
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clear.mutate()}
            disabled={!invoiceId || busy}
            isLoading={clear.isPending}
          >
            B2B Onaylat
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => generateQr.mutate()}
            disabled={!invoiceId || busy}
            isLoading={generateQr.isPending}
          >
            <QrCode size={13} />
            QR Üret
          </Button>
        </div>

        {result && (() => {
          const cfg = STATUS_CONFIG[result.status as StatusKey] ?? STATUS_CONFIG.PENDING;
          const Icon = cfg.icon;
          return (
            <div className="border border-border rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon size={15} className={cfg.className} />
                <span className={cn('text-sm font-medium', cfg.className)}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{result.mode}</span>
              </div>
              <p className="text-xs text-muted-foreground ">ID: {result.submissionId}</p>
              {result.message && <p className="text-sm text-foreground">{result.message}</p>}
              {result.warnings && result.warnings.length > 0 && (
                <ul className="text-sm text-muted-foreground flex flex-col gap-0.5">
                  {result.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Gönderim: {new Date(result.submittedAt).toLocaleString('tr-TR')}
              </p>
            </div>
          );
        })()}

        {qrCode && (
          <div className="border border-border rounded-lg p-4 flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <QrCode size={13} className="text-muted-foreground" /> QR Kod (Base64)
            </p>
            <Textarea readOnly className="text-xs resize-none" rows={4} value={qrCode} />
            <p className="text-xs text-muted-foreground">Bu değeri faturanıza gömebilirsiniz</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Zakat Hesaplama ──────────────────────────────────────────────────────────

function ZakatCalculator() {
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [totalAssets, setTotalAssets] = useState('');
  const [currentLiabilities, setCurrentLiabilities] = useState('');
  const [result, setResult] = useState<ZakatResult | null>(null);

  const calc = useMutation({
    mutationFn: () => ksaApi.calculateZakat({
      fiscalYear,
      totalAssets: parseFloat(totalAssets),
      currentLiabilities: parseFloat(currentLiabilities),
    }),
    onSuccess: (data) => setResult(data.data),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calculator size={14} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Zakat Hesaplama</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Yıllık Zakat matrahı ve ödeme miktarı (%2.5)</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Mali Yıl</Label>
            <Select value={String(fiscalYear)} onValueChange={v => setFiscalYear(Number(v))}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Toplam Varlıklar (SAR)</Label>
            <Input
              type="number"
              className=""
              value={totalAssets}
              onChange={e => setTotalAssets(e.target.value)}
              placeholder="1000000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Kısa Vadeli Borçlar (SAR)</Label>
            <Input
              type="number"
              className=""
              value={currentLiabilities}
              onChange={e => setCurrentLiabilities(e.target.value)}
              placeholder="200000"
            />
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => calc.mutate()}
          disabled={!totalAssets || !currentLiabilities || calc.isPending}
          isLoading={calc.isPending}
          className="w-fit"
        >
          Hesapla
        </Button>

        {result && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Nisap (Alt Sınır)</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {result.currency} {result.nisapAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Zakat Matrahı</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {result.currency} {result.zakatBase.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Zakat Oranı</p>
              <p className="text-lg font-bold text-foreground mt-1">%{(result.zakatRate * 100).toFixed(1)}</p>
            </div>
            <div className={cn(
              'rounded-lg p-3 border',
              result.isAboveNisap
                ? 'bg-muted border-border'
                : 'bg-primary/10 border-primary/20',
            )}>
              <p className="text-xs text-muted-foreground">Ödenecek Zakat</p>
              <p className={cn(
                'text-xl font-bold mt-1',
                result.isAboveNisap ? 'text-foreground' : 'text-primary',
              )}>
                {result.currency} {result.zakatAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs mt-1 text-muted-foreground">
                {result.isAboveNisap ? 'Nisap üstünde — Zakat gerekli' : 'Nisap altında — Zakat gerekmez'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── CSR / CSID Üretimi ───────────────────────────────────────────────────────

function CsrGenerator() {
  const [commonName, setCommonName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [result, setResult] = useState<{ csr: string; instructions: string } | null>(null);

  const generate = useMutation({
    mutationFn: () => ksaApi.generateCsr({ commonName, organizationName, vatNumber }),
    onSuccess: (data) => setResult(data.data),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">CSR / CSID Üretimi</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">ZATCA uyum için sertifika imzalama isteği (CSR) oluşturma</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Common Name (CN)</Label>
            <Input value={commonName} onChange={e => setCommonName(e.target.value)} placeholder="Şirket Adı" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Organization Name (O)</Label>
            <Input value={organizationName} onChange={e => setOrganizationName(e.target.value)} placeholder="Şirket Tam Adı" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">VAT Numarası (VRN)</Label>
            <Input className="" value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="300000000000003" />
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => generate.mutate()}
          disabled={!commonName || !organizationName || !vatNumber || generate.isPending}
          isLoading={generate.isPending}
          className="w-fit"
        >
          CSR Üret
        </Button>

        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">CSR (PEM Formatı)</p>
              <Textarea readOnly className="text-xs resize-none" rows={6} value={result.csr} />
            </div>
            <div className="bg-muted border border-border rounded-lg p-3">
              <p className="text-sm text-foreground">{result.instructions}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function KsaZatcaPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <Shield size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">KSA ZATCA</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Suudi Arabistan e-Fatura uyumu — Zakat, Tax and Customs Authority</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-xs">ZATCA Phase 2</Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <InvoiceActions />
        <ZakatCalculator />
      </div>

      <CsrGenerator />
    </div>
  );
}
