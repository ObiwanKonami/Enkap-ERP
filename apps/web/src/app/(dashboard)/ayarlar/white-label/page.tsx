'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Paintbrush, Globe, Link2, CheckCircle2, AlertCircle,
  Save, ExternalLink, Info, Loader2, Sun, Moon,
  Palette, Phone, Mail, ArrowRight,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { tenantApi, type WhiteLabelConfig, type UpsertWhiteLabelPayload } from '@/services/tenant';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Önizleme (BrandPreview) ───────────────────────────────────────────────────

function BrandPreview({ cfg }: { cfg: UpsertWhiteLabelPayload & { brandName?: string | null } }) {
  const [dark, setDark] = useState(false);

  const primary   = cfg.primaryColor   ?? '#0EA5E9';
  const secondary = cfg.secondaryColor ?? '#0369A1';

  const sidebarBg = dark ? "bg-[#0f172a]" : "bg-white";
  const contentBg = dark ? "bg-[#070d1a]" : "bg-[#f8fafc]";
  const cardBg    = dark ? "bg-[#0f172a]" : "bg-white";
  const textMain  = dark ? "text-[#f1f5f9]" : "text-[#111827]";
  const textMuted = dark ? "text-[#64748b]" : "text-[#6b7280]";
  const borderClr = dark ? "border-[#1e293b]/60" : "border-[#e5e7eb]";
  const navInact  = dark ? "bg-[#1e293b]" : "bg-[#e2e8f0]";

  return (
    <div className="relative">
      <Card className="overflow-hidden shadow-lg ring-1 ring-border/50 relative rounded-b-none">
      {/* Tarayıcı Çubuğu */}
      <div className="bg-[#1e293b] px-4 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5 shrink-0">
          <div className="size-2 rounded-full bg-rose-500" />
          <div className="size-2 rounded-full bg-amber-500" />
          <div className="size-2 rounded-full bg-emerald-500" />
        </div>
          <div className="flex-1 bg-black/40 rounded-md py-1 px-3 border border-white/5 flex items-center justify-between">
          <span className="text-[9px] text-slate-400 truncate tracking-tight">
            {cfg.subdomain ? `app.${cfg.subdomain}.enkap.com.tr` : 'Özel domain ayarlanmamış'}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setDark(!dark)}
                  className="size-5 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-400 transition-colors"
                >
                  {dark ? <Sun size={10} /> : <Moon size={10} />}
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-[10px]">
                {dark ? 'Açık Tema' : 'Koyu Tema'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Dashboard Mock-up */}
      <div className={cn("flex h-[320px] transition-all duration-500", contentBg)}>
        {/* Sidebar */}
        <div className={cn("w-16 shrink-0 border-r py-5 flex flex-col items-center gap-6 transition-colors duration-500", sidebarBg, borderClr)}>
          {cfg.logoUrl ? (
            <img src={cfg.logoUrl} alt="logo" className="size-8 object-contain rounded-lg shadow-sm" />
          ) : (
            <div className="size-8 rounded-xl shadow-lg border border-white/10 flex items-center justify-center p-0.5" style={{
              background: `linear-gradient(135deg, ${primary}, ${secondary})`
            }}>
              <div className="size-full bg-white/20 backdrop-blur-sm rounded-[9px]" />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {[true, false, false, false].map((active, i) => (
              <div key={i} className={cn(
                "size-8 rounded-xl transition-all duration-300 flex items-center justify-center",
                active ? "shadow-md" : "opacity-30"
              )} style={{ backgroundColor: active ? primary : 'transparent' }}>
                <div className={cn("size-3 rounded-sm", active ? "bg-white/90" : navInact)} />
              </div>
            ))}
          </div>
        </div>

        {/* İçerik Alanı */}
        <div className="flex-1 min-w-0 p-5 flex flex-col gap-5">
          {/* Topbar */}
          <div className={cn("flex items-center justify-between pb-3 border-b transition-colors duration-500", borderClr)}>
            <div className="flex items-center gap-2">
              <h4 className={cn("text-xs font-bold tracking-tighter transition-colors", textMain)}>
                {cfg.brandName || 'Firma ERP'}
              </h4>
              <Badge variant="outline" className="h-4 px-1 text-[8px] uppercase tracking-tighter opacity-40">Pro</Badge>
            </div>
            <div className="size-7 rounded-full transition-all" style={{ backgroundColor: primary, opacity: 0.15 }} />
          </div>

          {/* KPI Gridi */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Gelir', v: '₺142K', c: primary },
              { l: 'Sipariş', v: '42', c: secondary },
              { l: 'Büyüme', v: '%12', c: "#10B981" },
            ].map((k) => (
              <div key={k.l} className={cn("p-3 rounded-xl border border-dashed transition-all duration-500", cardBg, borderClr)}>
                <p className={cn("text-[8px] font-bold uppercase tracking-widest mb-1 opacity-50", textMuted)}>{k.l}</p>
                <p className="text-sm font-bold tracking-tighter" style={{ color: k.c }}>{k.v}</p>
              </div>
            ))}
          </div>

          {/* Aksiyon Şeridi */}
          <div className="flex gap-2">
            <div className="h-7 px-3 rounded-lg flex items-center text-[9px] font-bold uppercase tracking-widest text-white shadow-sm cursor-default" style={{ backgroundColor: primary }}>
              + Yeni İşlem
            </div>
            <div className={cn("h-7 px-3 rounded-lg border flex items-center text-[9px] font-bold uppercase tracking-widest transition-all", cardBg, borderClr, textMuted)}>
              Filtrele
            </div>
          </div>

          {/* Mini Liste */}
          <div className={cn("flex-1 p-3 rounded-xl border transition-colors duration-500", cardBg, borderClr)}>
            <div className="flex justify-between items-center mb-2 px-1">
              <span className={cn("text-[9px] font-bold uppercase tracking-widest opacity-40", textMuted)}>Son Belgeler</span>
              <div className="flex gap-1">
                <div className="size-1 rounded-full bg-primary" />
                <div className="size-1 rounded-full bg-muted-foreground/20" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {[1, 2].map(i => (
                <div key={i} className={cn("flex items-center justify-between p-2 rounded-lg bg-muted/20 border transition-all", borderClr)}>
                  <div className="flex flex-col gap-0.5">
                    <span className={cn("text-[9px] font-bold px-1 rounded bg-black/5", textMain)}>FAT-002{i}</span>
                    <span className="text-[8px] opacity-40 font-bold uppercase tracking-wider">Demir Ltd. Şti.</span>
                  </div>
                  <Badge className={cn(
                    "text-[8px] px-1.5 h-4 shadow-none border-none",
                    i === 1 ? "bg-primary/10 text-primary" : "bg-muted-foreground/10 text-muted-foreground"
                  )}>
                    {i === 1 ? 'Ödendi' : 'Beklemede'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </Card>
      
      {/* Alt Şerit - Card'ın altına uzanacak */}
      <div className="h-1.5 w-full flex items-center -mt-1.5 rounded-b-lg overflow-hidden">
        <div className="h-full flex-1" style={{ backgroundColor: primary }} />
        <div className="h-full flex-1" style={{ backgroundColor: secondary }} />
      </div>
    </div>
  );
}

// ─── Renk Alanı ─────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-3">
        <label className="size-10 rounded-lg border border-border p-0.5 cursor-pointer flex items-center justify-center" style={{ backgroundColor: value }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)} className="sr-only" />
          <div className="size-full rounded-md border border-white/20" />
        </label>
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 text-xs uppercase tracking-widest"
        />
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function WhiteLabelPage() {
  const { data: session } = useSession();
  const tenantId = (session?.user as { tenantId?: string } | undefined)?.tenantId ?? '';

  const [form, setForm] = useState<UpsertWhiteLabelPayload>({
    subdomain:     null,
    customDomain:  null,
    brandName:     null,
    logoUrl:       null,
    faviconUrl:    null,
    primaryColor:  '#0EA5E9',
    secondaryColor:'#0369A1',
    supportEmail:  null,
    supportPhone:  null,
  });
  const [config,       setConfig    ] = useState<WhiteLabelConfig | null>(null);
  const [fetching,     setFetching  ] = useState(true);
  const [saving,       setSaving    ] = useState(false);
  const [verifying,    setVerifying ] = useState(false);
  const [verifyResult, setVerify    ] = useState<{ verified: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setFetching(true);
    try {
      const res = await tenantApi.getWhiteLabel(tenantId);
      const d = (res as { data?: WhiteLabelConfig }).data ?? res as unknown as WhiteLabelConfig;
      setConfig(d);
      setForm({
        subdomain:     d.subdomain,
        customDomain:  d.customDomain,
        brandName:     d.brandName,
        logoUrl:       d.logoUrl,
        faviconUrl:    d.faviconUrl,
        primaryColor:  d.primaryColor,
        secondaryColor:d.secondaryColor,
        supportEmail:  d.supportEmail,
        supportPhone:  d.supportPhone,
      });
    } catch {
      // Varsayılan
    } finally {
      setFetching(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await tenantApi.upsertWhiteLabel(tenantId, form);
      const d = (res as { data?: WhiteLabelConfig }).data ?? res as unknown as WhiteLabelConfig;
      setConfig(d);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true); setVerify(null);
    try {
      const res = await tenantApi.verifyDomain(tenantId);
      const d = (res as { data?: { verified: boolean; message: string } }).data ?? res as unknown as { verified: boolean; message: string };
      setVerify(d);
    } catch {
      setVerify({ verified: false, message: 'Domain doğrulama isteği başarısız.' });
    } finally {
      setVerifying(false);
    }
  };

  const set = (key: keyof UpsertWhiteLabelPayload, value: string | null) =>
    setForm(prev => ({ ...prev, [key]: value || null }));

  if (fetching) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Yapılandırma alınıyor…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Başlık */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Paintbrush size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">White Label</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Marka kimliği ve domain özelleştirme</p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          isLoading={saving}
          className="gap-2"
        >
          {!saving && <Save size={14} />}
          Değişiklikleri Kaydet
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Ayarlar Formu */}
        <div className="xl:col-span-7">
          <Tabs defaultValue="brand" className="flex flex-col gap-6">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="brand" className="gap-2">
                <Palette size={14} /> Marka
              </TabsTrigger>
              <TabsTrigger value="domain" className="gap-2">
                <Globe size={14} /> Domain
              </TabsTrigger>
              <TabsTrigger value="support" className="gap-2">
                <Phone size={14} /> Destek
              </TabsTrigger>
            </TabsList>

            {/* ── Marka Sekmesi ── */}
            <TabsContent value="brand" className="mt-0">
              <Card className="shadow-sm">
                <CardHeader className="border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Palette size={14} className="text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">Marka Kimliği</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Dashboard renklerini ve logolarınızı yapılandırın</CardDescription>
                </CardHeader>
                <CardContent className="p-6 flex flex-col gap-6">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Görünecek Marka Adı</Label>
                    <Input
                      value={form.brandName || ''}
                      onChange={e => set('brandName', e.target.value)}
                      placeholder="Örn: Enkap ERP"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Logo URL</Label>
                    <Input
                      value={form.logoUrl || ''}
                      onChange={e => set('logoUrl', e.target.value)}
                      placeholder="https://cdn.firma.com/logo.png"
                      className="text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">SVG veya saydam PNG önerilir (max 120px yükseklik)</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ColorField label="Ana Renk (Primary)" value={form.primaryColor || '#0EA5E9'} onChange={v => set('primaryColor', v)} />
                    <ColorField label="Vurgu Rengi (Secondary)" value={form.secondaryColor || '#0369A1'} onChange={v => set('secondaryColor', v)} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Domain Sekmesi ── */}
            <TabsContent value="domain" className="mt-0">
              <Card className="shadow-sm">
                <CardHeader className="border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">Domain & Erişim</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Alt alan adı ve özel domain yapılandırması</CardDescription>
                </CardHeader>
                <CardContent className="p-6 flex flex-col gap-6">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Subdomain Adresi</Label>
                    <div className="flex items-center">
                      <Input
                        value={form.subdomain || ''}
                        onChange={e => set('subdomain', e.target.value.toLowerCase())}
                        placeholder="firma-adi"
                        className="rounded-tr-none rounded-br-none text-right"
                      />
                      <div className="h-9 px-3 bg-muted border border-l-0 border-input rounded-tr-md rounded-br-md text-xs text-muted-foreground flex items-center whitespace-nowrap">
                        .enkap.com.tr
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-3">
                    <Label className="text-xs text-muted-foreground">Özel Domain (Opsiyonel)</Label>
                    <Input
                      value={form.customDomain || ''}
                      onChange={e => set('customDomain', e.target.value.toLowerCase())}
                      placeholder="erp.firma-adi.com"
                      className="text-xs"
                    />

                    {form.customDomain && (
                      <Alert>
                        <Info size={14} />
                        <AlertTitle className="text-xs font-semibold">DNS Yönlendirme Gerekli</AlertTitle>
                        <AlertDescription className="text-xs leading-relaxed">
                          Domain panelinizden şu CNAME kaydını ekleyin:
                          <code className="block mt-2 text-[11px] px-2 py-1 bg-muted rounded border border-border">
                            {form.customDomain} {" -> "} api.enkap.com.tr
                          </code>
                        </AlertDescription>
                      </Alert>
                    )}

                    {config?.customDomain && (
                      <div className="flex flex-col gap-3 pt-2 border-t border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            {config.domainVerified ? (
                              <Badge variant="secondary" className="gap-1.5">
                                <CheckCircle2 size={11} /> Doğrulandı
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1.5">
                                <AlertCircle size={11} /> Onay Bekleniyor
                              </Badge>
                            )}
                          </div>
                          {!config.domainVerified && (
                            <Button
                              onClick={handleVerify}
                              disabled={verifying}
                              isLoading={verifying}
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                            >
                              {!verifying && <Link2 size={12} />}
                              Doğrula
                            </Button>
                          )}
                        </div>
                        {verifyResult && (
                          <div className={cn(
                            "p-3 rounded-lg flex items-center gap-2 text-xs border",
                            verifyResult.verified
                              ? "bg-primary/10 border-primary/20 text-primary"
                              : "bg-destructive/10 border-destructive/20 text-destructive"
                          )}>
                            {verifyResult.verified ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                            {verifyResult.message}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Destek Sekmesi ── */}
            <TabsContent value="support" className="mt-0">
              <Card className="shadow-sm">
                <CardHeader className="border-b border-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">İletişim & Destek</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Müşterilerinizin göreceği iletişim kanallarını güncelleyin</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Mail size={11} /> Destek E-Posta
                      </Label>
                      <Input
                        value={form.supportEmail || ''}
                        onChange={e => set('supportEmail', e.target.value)}
                        placeholder="destek@firma.com"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone size={11} /> Destek Hattı
                      </Label>
                      <Input
                        value={form.supportPhone || ''}
                        onChange={e => set('supportPhone', e.target.value)}
                        placeholder="+90 212 000 00 00"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Canlı Önizleme */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1">Canlı Önizleme</p>

          <div className="sticky top-24 flex flex-col gap-4">
            <BrandPreview cfg={{ ...form, brandName: form.brandName }} />

            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <ExternalLink size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Erişim Adresiniz</p>
                  {form.customDomain || config?.subdomain ? (
                    <p className="text-xs text-foreground truncate">
                      {form.customDomain || `${config?.subdomain}.enkap.com.tr`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground truncate italic">
                      Alt domain ayarlanmamış
                    </p>
                  )}
                </div>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground shrink-0">
                  <ArrowRight size={13} />
                </Button>
              </CardContent>
            </Card>

            {config?.domainVerified && config.customDomain && (
              <Alert>
                <CheckCircle2 size={13} />
                <AlertDescription className="text-xs font-medium truncate">
                  Aktif özel domain: <span className="ml-1">{config.customDomain}</span>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
