'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Scale, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const t = createTranslator(DEFAULT_LOCALE);

// ─── Tipler ─────────────────────────────────────────────────────────────────

interface GvBracket {
  limitKurus: number;
  rate:       number;
}

interface FiscalParams {
  year:                 number;
  minWageKurus:         number;
  sgkCeilingKurus:      number;
  sgkWorkerRate:        number;
  unemploymentWorker:   number;
  sgkEmployerRate:      number;
  unemploymentEmployer: number;
  stampTaxRate:         number;
  gvBrackets:           GvBracket[];
  disabilityDeductions: { 1: number; 2: number; 3: number };
}

interface FiscalParamsForm {
  minWageTl:               string;
  sgkCeilingTl:            string;
  sgkWorkerRatePct:        string;
  unemploymentWorkerPct:   string;
  sgkEmployerRatePct:      string;
  unemploymentEmployerPct: string;
  stampTaxRatePct:         string;
  gvBrackets:              Array<{ limitTl: string; ratePct: string }>;
  disability1Tl:           string;
  disability2Tl:           string;
  disability3Tl:           string;
}

function kurusTl(kurus: number): string {
  return (kurus / 100).toFixed(2);
}

function rateToStr(rate: number): string {
  return (rate * 100).toFixed(5);
}

function paramsToForm(p: FiscalParams): FiscalParamsForm {
  return {
    minWageTl:             kurusTl(p.minWageKurus),
    sgkCeilingTl:          kurusTl(p.sgkCeilingKurus),
    sgkWorkerRatePct:      rateToStr(p.sgkWorkerRate),
    unemploymentWorkerPct: rateToStr(p.unemploymentWorker),
    sgkEmployerRatePct:    rateToStr(p.sgkEmployerRate),
    unemploymentEmployerPct: rateToStr(p.unemploymentEmployer),
    stampTaxRatePct:       rateToStr(p.stampTaxRate),
    gvBrackets: p.gvBrackets.map(b => ({
      limitTl: b.limitKurus >= 9_000_000_000 ? '∞' : kurusTl(b.limitKurus),
      ratePct: rateToStr(b.rate),
    })),
    disability1Tl: kurusTl(p.disabilityDeductions[1]),
    disability2Tl: kurusTl(p.disabilityDeductions[2]),
    disability3Tl: kurusTl(p.disabilityDeductions[3]),
  };
}

function formToDto(form: FiscalParamsForm): Omit<FiscalParams, 'year'> {
  return {
    minWageKurus:         Math.round(parseFloat(form.minWageTl) * 100),
    sgkCeilingKurus:      Math.round(parseFloat(form.sgkCeilingTl) * 100),
    sgkWorkerRate:        parseFloat(form.sgkWorkerRatePct) / 100,
    unemploymentWorker:   parseFloat(form.unemploymentWorkerPct) / 100,
    sgkEmployerRate:      parseFloat(form.sgkEmployerRatePct) / 100,
    unemploymentEmployer: parseFloat(form.unemploymentEmployerPct) / 100,
    stampTaxRate:         parseFloat(form.stampTaxRatePct) / 100,
    gvBrackets: form.gvBrackets.map(b => ({
      limitKurus: b.limitTl === '∞' ? 9_999_999_999 : Math.round(parseFloat(b.limitTl) * 100),
      rate:       parseFloat(b.ratePct) / 100,
    })),
    disabilityDeductions: {
      1: Math.round(parseFloat(form.disability1Tl) * 100),
      2: Math.round(parseFloat(form.disability2Tl) * 100),
      3: Math.round(parseFloat(form.disability3Tl) * 100),
    },
  };
}

// ─── Yardımcı Bileşenler ─────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
      {label}
    </p>
  );
}

function InputField({ label, value, onChange, suffix }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground min-w-[16px]">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function YasalParametrelerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [form, setForm]                 = useState<FiscalParamsForm | null>(null);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/platform-giris');
    } else if (status === 'authenticated' && !session?.isPlatformAdmin) {
      router.replace('/');
    }
  }, [status, session, router]);

  const loadParams = useCallback(async () => {
    if (status !== 'authenticated' || !session?.isPlatformAdmin) return;
    setLoading(true);
    try {
      const res = await apiClient.get<FiscalParams>(`/hr/payroll/fiscal-params/${selectedYear}`);
      setForm(paramsToForm(res.data));
    } catch {
      toast.error('Parametreler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, status, session]);

  useEffect(() => { void loadParams(); }, [loadParams]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const dto = formToDto(form);
      await apiClient.put(`/hr/payroll/fiscal-params/${selectedYear}`, dto);
      toast.success(`${selectedYear} yılı yasal parametreleri kaydedildi.`);
    } catch {
      toast.error('Kayıt sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: keyof FiscalParamsForm, value: string) {
    setForm(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function updateBracket(idx: number, field: 'limitTl' | 'ratePct', value: string) {
    setForm(prev => {
      if (!prev) return prev;
      const brackets = [...prev.gvBrackets];
      brackets[idx] = { ...brackets[idx], [field]: value };
      return { ...prev, gvBrackets: brackets };
    });
  }

  function addBracket() {
    setForm(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        gvBrackets: [
          ...prev.gvBrackets.filter(b => b.limitTl !== '∞'),
          { limitTl: '0', ratePct: '0' },
          { limitTl: '∞', ratePct: prev.gvBrackets.find(b => b.limitTl === '∞')?.ratePct ?? '40' },
        ],
      };
    });
  }

  function removeBracket(idx: number) {
    setForm(prev => {
      if (!prev) return prev;
      const brackets = [...prev.gvBrackets];
      brackets.splice(idx, 1);
      return { ...prev, gvBrackets: brackets };
    });
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="flex flex-col gap-6 max-w-4xl">

      {/* Başlık + yıl seçici */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Scale size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Yasal Parametreler</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bordro hesaplamalarında kullanılan yıllık yasal değerler
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleSave}
            disabled={saving}
            isLoading={saving}
            className="gap-2"
          >
            {!saving && <Save size={14} />}
            Kaydet
          </Button>
        </div>
      </div>

      {/* ─── Temel Ücret & SGK ────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <SectionLabel label="Temel Değerler" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField label="Asgari Ücret (TL)" value={form.minWageTl} onChange={v => updateField('minWageTl', v)} suffix="₺" />
            <InputField label="SGK Tavan (TL)" value={form.sgkCeilingTl} onChange={v => updateField('sgkCeilingTl', v)} suffix="₺" />
          </div>
        </CardContent>
      </Card>

      {/* ─── SGK Oranları ─────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <SectionLabel label="SGK & İşsizlik Oranları" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField label="SGK İşçi Oranı" value={form.sgkWorkerRatePct} onChange={v => updateField('sgkWorkerRatePct', v)} suffix="%" />
            <InputField label="İşçi İşsizlik Oranı" value={form.unemploymentWorkerPct} onChange={v => updateField('unemploymentWorkerPct', v)} suffix="%" />
            <InputField label="SGK İşveren Oranı" value={form.sgkEmployerRatePct} onChange={v => updateField('sgkEmployerRatePct', v)} suffix="%" />
            <InputField label="İşveren İşsizlik Oranı" value={form.unemploymentEmployerPct} onChange={v => updateField('unemploymentEmployerPct', v)} suffix="%" />
            <InputField label="Damga Vergisi Oranı" value={form.stampTaxRatePct} onChange={v => updateField('stampTaxRatePct', v)} suffix="%" />
          </div>
        </CardContent>
      </Card>

      {/* ─── GV Dilimleri ─────────────────────────────────────────────────── */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel label="Gelir Vergisi Dilimleri" />
            <Button variant="outline" size="sm" onClick={addBracket} className="gap-1.5 -mt-4">
              <Plus size={13} />
              Dilim Ekle
            </Button>
          </div>
        </CardContent>
        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wider py-3 pl-6 w-12">#</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider py-3">Tavan (TL)</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider py-3">Oran (%)</TableHead>
                <TableHead className="py-3 pr-6 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.gvBrackets.map((b, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-6 text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    {b.limitTl === '∞' ? (
                      <span className="text-sm text-muted-foreground">Sınırsız</span>
                    ) : (
                      <Input
                        type="text"
                        value={b.limitTl}
                        onChange={e => updateBracket(i, 'limitTl', e.target.value)}
                        className="w-40 "
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      value={b.ratePct}
                      onChange={e => updateBracket(i, 'ratePct', e.target.value)}
                      className="w-24 "
                    />
                  </TableCell>
                  <TableCell className="pr-6">
                    {form.gvBrackets.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeBracket(i)}
                        title="Dilimi sil"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ─── Engelli İndirimi ─────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <SectionLabel label="Engelli İndirimi (Aylık, TL)" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InputField label="1. Derece" value={form.disability1Tl} onChange={v => updateField('disability1Tl', v)} suffix="₺" />
            <InputField label="2. Derece" value={form.disability2Tl} onChange={v => updateField('disability2Tl', v)} suffix="₺" />
            <InputField label="3. Derece" value={form.disability3Tl} onChange={v => updateField('disability3Tl', v)} suffix="₺" />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
