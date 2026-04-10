"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Store, Plus, RefreshCw, Power, X, Check,
  AlertCircle, Link2, Clock, ExternalLink, Loader2,
} from "lucide-react";
import {
  ecommerceApi,
  PLATFORM_LABELS,
  PLATFORM_DESC,
  type EcommerceIntegration,
  type PlatformType,
} from "@/services/ecommerce";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null, t: (k: string) => string) => {
  if (!iso) return t("ecommerce.notYetSynced");
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ─── Platform Renk + Badge ────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<PlatformType, { bg: string; text: string; border: string }> = {
  woocommerce: { bg: "bg-[#7F54B3]/10", text: "text-[#7F54B3]", border: "border-[#7F54B3]/25" },
  shopify:     { bg: "bg-[#96BF48]/10", text: "text-[#96BF48]", border: "border-[#96BF48]/25" },
  ticimax:     { bg: "bg-[#E65C2B]/10", text: "text-[#E65C2B]", border: "border-[#E65C2B]/25" },
  ideasoft:    { bg: "bg-[#0A7CFF]/10", text: "text-[#0A7CFF]", border: "border-[#0A7CFF]/25" },
};

function PlatformIcon({ platform, size = "md" }: { platform: PlatformType; size?: "sm" | "md" }) {
  const cls = PLATFORM_COLORS[platform];
  return (
    <div className={cn(
      "rounded-lg border flex items-center justify-center font-bold shrink-0",
      cls.bg, cls.text, cls.border,
      size === "sm" ? "size-8 text-xs" : "size-9 text-sm",
    )}>
      {PLATFORM_LABELS[platform][0]}
    </div>
  );
}

// ─── Entegrasyon Ekle Modalı ─────────────────────────────────────────────────

const PLATFORMS: PlatformType[] = ["woocommerce", "shopify", "ticimax", "ideasoft"];

function AddIntegrationModal({
  open, onClose, onSuccess,
}: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<PlatformType>("woocommerce");
  const [form, setForm] = useState({ storeUrl: "", storeName: "", apiKey: "", apiSecret: "", accessToken: "" });
  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const needsToken = platform === "shopify";

  const mut = useMutation({
    mutationFn: () => ecommerceApi.create({ platform, ...form }),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  const canSubmit = !!form.storeUrl && !!form.storeName;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store size={16} className="text-sky-500" />
            {t('ecommerce.newIntegration')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Platform Seçici */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">{t("ecommerce.selectPlatform")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {PLATFORMS.map((p) => {
                const cls = PLATFORM_COLORS[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={cn(
                      "py-2.5 px-2 rounded-lg border text-xs font-medium transition-all",
                      platform === p
                        ? cn(cls.bg, cls.text, cls.border)
                        : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {PLATFORM_LABELS[p]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{PLATFORM_DESC[platform]}</p>
          </div>

          <Separator />

          {/* Form Alanları */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("ecommerce.storeName")}</Label>
              <Input className="h-9 bg-muted/40" placeholder="Örn: Mağazam" value={form.storeName} onChange={upd("storeName")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("ecommerce.storeUrl")}</Label>
              <Input className="h-9 bg-muted/40" type="url" placeholder="https://magaza.com" value={form.storeUrl} onChange={upd("storeUrl")} />
            </div>
            {!needsToken ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("ecommerce.apiKey")}</Label>
                  <Input className="h-9 bg-muted/40" value={form.apiKey} onChange={upd("apiKey")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("ecommerce.apiSecret")}</Label>
                  <Input className="h-9 bg-muted/40" type="password" value={form.apiSecret} onChange={upd("apiSecret")} />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("ecommerce.accessToken")}</Label>
                <Input className="h-9 bg-muted/40" type="password" value={form.accessToken} onChange={upd("accessToken")} />
              </div>
            )}
          </div>

          {mut.isError && (
            <Alert variant="destructive">
              <AlertCircle size={13} />
              <AlertDescription>{t('ecommerce.createError')}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit} className="gap-2">
            {mut.isPending && <Loader2 size={13} className="animate-spin" />}
            {t('ecommerce.newIntegration')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entegrasyon Kartı ────────────────────────────────────────────────────────

function IntegrationCard({
  integration, onToggle, onSync, t,
}: {
  integration: EcommerceIntegration;
  onToggle: (id: string) => void;
  onSync: (id: string) => void;
  t: (k: string) => string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5 pb-4 flex flex-col gap-4">
        {/* Başlık */}
        <div className="flex items-start gap-3">
          <PlatformIcon platform={integration.platform} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{integration.storeName}</span>
              <Link href={`/e-ticaret/${integration.id}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-sky-400 transition-colors" title="Detay">
                <ExternalLink size={11} />
              </Link>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-semibold px-2 py-0 h-5",
                  integration.isActive
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    : "bg-muted/30 text-muted-foreground border-border"
                )}
              >
                {integration.isActive ? t("ecommerce.active") : t("ecommerce.inactive")}
              </Badge>
            </div>
            <a
              href={integration.storeUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-sky-400 transition-colors mt-1"
            >
              <Link2 size={10} /> {integration.storeUrl}
            </a>
          </div>
        </div>

        {/* İstatistikler */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground mb-1">{t("ecommerce.syncedProducts")}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{integration.syncedProducts.toLocaleString("tr-TR")}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground mb-1">{t("ecommerce.syncedOrders")}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{integration.syncedOrders.toLocaleString("tr-TR")}</p>
          </div>
        </div>

        {/* Son Senkronizasyon */}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock size={11} />
          {t("ecommerce.lastSync")}: {fmtDate(integration.lastSyncedAt, t)}
        </p>

        {/* Hata Mesajı */}
        {integration.errorMessage && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle size={11} />
            <AlertDescription className="text-xs">{integration.errorMessage}</AlertDescription>
          </Alert>
        )}

        {/* Aksiyonlar */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            className="flex-1 h-8 text-xs gap-1.5"
            onClick={() => onSync(integration.id)}
          >
            <RefreshCw size={12} /> {t('ecommerce.syncNow')}
          </Button>
          <Button
            variant="outline" size="sm"
            className={cn(
              "flex-1 h-8 text-xs gap-1.5",
              integration.isActive
                ? "text-red-400 border-red-500/20 hover:bg-red-500/10"
                : "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
            )}
            onClick={() => onToggle(integration.id)}
          >
            <Power size={12} />
            {integration.isActive ? t("ecommerce.disable") : t("ecommerce.enable")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ETicaretPage() {
  const { t }  = useI18n();
  const qc     = useQueryClient();
  const [addModal, setAddModal] = useState(false);
  const [toast,    setToast   ] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["ecommerce-integrations"],
    queryFn: () => ecommerceApi.list().then((r) => r.data).catch(() => ({ data: [], total: 0 })),
  });
  const integrations: EcommerceIntegration[] = data?.data ?? [];

  const toggleMut = useMutation({
    mutationFn: (id: string) => ecommerceApi.toggle(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ecommerce-integrations"] });
      showToast(res.data.isActive ? t('ecommerce.integrationEnabled') : t('ecommerce.integrationDisabled'), true);
    },
    onError: () => showToast(t('ecommerce.operationFailed'), false),
  });
  const syncMut = useMutation({
    mutationFn: (id: string) => ecommerceApi.sync(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ecommerce-integrations"] });
      showToast(t('ecommerce.syncComplete').replace('{count}', String(res.data.synced)), true);
    },
    onError: () => showToast(t('ecommerce.syncFailed'), false),
  });

  const activeCount    = integrations.filter((i) => i.isActive).length;
  const totalProducts  = integrations.reduce((s, i) => s + i.syncedProducts, 0);
  const totalOrders    = integrations.reduce((s, i) => s + i.syncedOrders,   0);

  const kpis = [
    { label: t('ecommerce.activeIntegration'), value: String(activeCount),                          cls: "text-emerald-400" },
    { label: t('ecommerce.totalProducts'),    value: totalProducts.toLocaleString("tr-TR"),         cls: "text-sky-400"    },
    { label: t('ecommerce.totalOrders'),      value: totalOrders.toLocaleString("tr-TR"),           cls: "text-violet-400" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Store size={20} className="text-sky-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('ecommerce.title')}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("ecommerce.description")}</p>
          </div>
        </div>
        <Button size="sm" className="h-9 gap-2 shadow-sm" onClick={() => setAddModal(true)}>
          <Plus size={15} /> {t('ecommerce.newIntegration')}
        </Button>
      </div>

      {/* Özet KPI */}
      <div className="grid grid-cols-3 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold tabular-nums tracking-tight", k.cls)}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entegrasyon Kartları */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Loader2 size={24} className="animate-spin" />
          {t('ecommerce.loading')}
        </div>
      ) : integrations.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Store size={32} className="text-muted-foreground opacity-25" />
            <div>
              <p className="text-sm font-medium text-foreground">{t('ecommerce.noIntegrationYet')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('ecommerce.storeDescription')}</p>
            </div>
            <Button size="sm" className="gap-2" onClick={() => setAddModal(true)}>
              <Plus size={14} /> {t('ecommerce.firstIntegration')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {integrations.map((i) => (
            <IntegrationCard
              key={i.id}
              integration={i}
              onToggle={(id) => toggleMut.mutate(id)}
              onSync={(id) => syncMut.mutate(id)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Desteklenen Platformlar (entegrasyon yoksa) */}
      {integrations.length === 0 && !isLoading && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('ecommerce.supportedPlatforms')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLATFORMS.map((p) => (
              <Card key={p} className="shadow-sm">
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <PlatformIcon platform={p} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{PLATFORM_LABELS[p]}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{PLATFORM_DESC[p]}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Ekle Modalı */}
      <AddIntegrationModal
        open={addModal}
        onClose={() => setAddModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["ecommerce-integrations"] });
          showToast(t('ecommerce.integrationAdded'), true);
        }}
      />

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-lg",
          toast.ok
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        )}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
