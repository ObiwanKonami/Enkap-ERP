"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenantApi, type TenantProfile } from "@/services/tenant";
import { PhoneInput } from "@/components/ui/phone-input";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useI18n } from "@/hooks/use-i18n";
import {
  Settings,
  Building2,
  FileText,
  Paintbrush,
  Key,
  Webhook,
  CreditCard,
  Save,
  Check,
  AlertCircle,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Hash,
  Landmark,
  UsersRound,
  DollarSign,
  Globe,
  Shield,
  Image,
  BadgeCheck,
  Percent,
  Wallet,
  ExternalLink,
  ArrowUpRight,
  CalendarDays,
  Zap,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function maskVkn(v: string) {
  if (!v) return "";
  return v.replace(/\D/g, "").slice(0, 10);
}

// ─── Yardımcı Bileşenler ──────────────────────────────────────────────────────

function Field({
  label,
  icon,
  children,
  hint,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <div className="size-5 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</Label>
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="size-4 rounded-full bg-muted flex items-center justify-center text-[9px] text-muted-foreground cursor-help">
                  ?
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[200px]">
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
    </div>
  );
}

function QuickCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="block no-underline">
      <Card className="shadow-sm hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="h-14 flex items-center gap-3 px-4 py-0">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground truncate">{desc}</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function AyarlarPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const tenantId = (session?.user as { tenantId?: string })?.tenantId ?? "";
  const tenantTier = (session?.user as { tenantTier?: string })?.tenantTier ?? "starter";

  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["tenant-profile", tenantId],
    queryFn: () => tenantApi.getProfile(tenantId),
    enabled: !!tenantId,
    select: (r) => r.data,
  });

  const [form, setForm] = useState<Partial<TenantProfile>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const set = (k: keyof TenantProfile, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => tenantApi.updateProfile(tenantId, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tenant-profile", tenantId] });
      setSaved(true);
      setSaveError("");
      setTimeout(() => setSaved(false), 2500);
    },
    onError: () => setSaveError(t("settings.saveError")),
  });

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1200px] pb-16">
      {/* Başlık */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
            <Settings size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.title")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.description")}</p>
          </div>
        </div>
        <Button
          onClick={() => save()}
          disabled={isPending || isLoading}
          isLoading={isPending}
          className="gap-2"
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? t("settings.saved") : t("settings.saveChanges")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Ayarlar Blokları */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          <Tabs defaultValue="company" className="w-full flex flex-col gap-6">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="company" className="flex items-center gap-2">
                <Building2 size={14} /> {t("settings.companyInfo")}
              </TabsTrigger>
              <TabsTrigger value="financial" className="flex items-center gap-2">
                <Wallet size={14} /> {t("settings.financialDefaults")}
              </TabsTrigger>
              <TabsTrigger value="invoice" className="flex items-center gap-2">
                <FileText size={14} /> {t("settings.invoiceSettings")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="company" className="mt-0">
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      <Building2 size={14} />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.companyInfo")}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{t("settings.companyInfoDesc")}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-2">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-10 w-full" />
                        </div>
                      ))
                    ) : (
                      <>
                        <Field label={t("settings.companyName")} icon={<Building2 size={13} />} className="md:col-span-2">
                          <Input
                            value={form.companyName ?? ""}
                            onChange={(e) => set("companyName", e.target.value)}
                            placeholder={t("settings.companyNamePlaceholder")}
                          />
                        </Field>

                        <Field label={t("settings.vkn")} icon={<Landmark size={13} />} hint={t("settings.vknHint")}>
                          <Input
                            value={form.vkn ?? ""}
                            onChange={(e) => set("vkn", maskVkn(e.target.value))}
                            className="tracking-[0.1em]"
                            maxLength={10}
                            placeholder="XXXXXXXXXX"
                          />
                        </Field>

                        <Field label={t("settings.taxOffice")} icon={<Landmark size={13} />}>
                          <Input
                            value={form.taxOffice ?? ""}
                            onChange={(e) => set("taxOffice", e.target.value)}
                            placeholder={t("settings.taxOfficePlaceholder")}
                          />
                        </Field>

                        <Field label={t("settings.sgkNumber")} icon={<BadgeCheck size={13} />} hint={t("settings.sgkNumberHint")}>
                          <Input
                            value={form.sgkEmployerNo ?? ""}
                            onChange={(e) => set("sgkEmployerNo", e.target.value)}
                            className=""
                            maxLength={20}
                            placeholder="X-XXXX-XX-XX-XXXXXXX"
                          />
                        </Field>

                        <Field label={t("settings.mersisNo")} icon={<Hash size={13} />} hint={t("settings.mersisNoHint")}>
                          <Input
                            value={form.mersisNo ?? ""}
                            onChange={(e) => set("mersisNo", e.target.value.replace(/\D/g, "").slice(0, 16))}
                            className="tracking-[0.1em]"
                            maxLength={16}
                            placeholder="XXXXXXXXXXXXXXXX"
                          />
                        </Field>

                        <Field label={t("settings.phone")} icon={<Phone size={13} />}>
                          <PhoneInput
                            value={form.phone ?? ""}
                            onChange={(v) => set("phone", v)}
                            className="w-full"
                          />
                        </Field>

                        <Field label={t("settings.email")} icon={<Mail size={13} />}>
                          <Input
                            type="email"
                            value={form.email ?? ""}
                            onChange={(e) => set("email", e.target.value)}
                            placeholder="mail@firma.com"
                          />
                        </Field>

                        <Field label={t("settings.address")} icon={<MapPin size={13} />} className="md:col-span-2">
                          <Textarea
                            value={form.address ?? ""}
                            onChange={(e) => set("address", e.target.value)}
                            className="min-h-24"
                            placeholder={t("settings.addressPlaceholder")}
                          />
                        </Field>

                        <Field label={t("settings.logoUrl")} icon={<Image size={13} />} hint={t("settings.logoUrlHint")} className="md:col-span-2">
                          <div className="flex gap-3">
                            <div className="relative flex-1">
                              <Input
                                value={form.logoUrl ?? ""}
                                onChange={(e) => set("logoUrl", e.target.value)}
                                className="text-xs pr-10"
                                placeholder="https://..."
                              />
                              <ArrowUpRight size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
                            </div>
                            {form.logoUrl && (
                              <div className="size-10 rounded-lg bg-muted border border-border p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                                <img
                                  src={form.logoUrl}
                                  alt="Preview"
                                  className="size-full object-contain"
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                              </div>
                            )}
                          </div>
                        </Field>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financial" className="mt-0">
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      <DollarSign size={14} />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.financialDefaults")}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{t("settings.financialDefaultsDesc")}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Field label={t("settings.defaultKdvRate")} icon={<Percent size={13} />} hint={t("settings.defaultKdvRateHint")}>
                      <Select value={String(form.defaultKdvRate ?? 20)} onValueChange={(v) => set("defaultKdvRate", Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">{t("settings.kdvExempt")}</SelectItem>
                          <SelectItem value="1">%1</SelectItem>
                          <SelectItem value="10">%10</SelectItem>
                          <SelectItem value="20">%20</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label={t("settings.paymentTermDays")} icon={<CalendarDays size={13} />} hint={t("settings.paymentTermDaysHint")}>
                      <div className="flex items-center">
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={form.defaultPaymentTermDays ?? 30}
                          onChange={(e) => set("defaultPaymentTermDays", Math.max(0, Math.min(365, Number(e.target.value))))}
                          className="rounded-tr-none rounded-br-none text-right"
                        />
                        <div className="h-10 px-3 bg-muted border border-l-0 border-input rounded-tr-md rounded-br-md text-xs text-muted-foreground flex items-center shrink-0">
                          {t("settings.days")}
                        </div>
                      </div>
                    </Field>

                    <Field label={t("settings.defaultCurrency")} icon={<DollarSign size={13} />}>
                      <Select value={form.defaultCurrency ?? "TRY"} onValueChange={(v) => set("defaultCurrency", v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRY">{t("settings.currencyTRY")}</SelectItem>
                          <SelectItem value="USD">{t("settings.currencyUSD")}</SelectItem>
                          <SelectItem value="EUR">{t("settings.currencyEUR")}</SelectItem>
                          <SelectItem value="GBP">{t("settings.currencyGBP")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label={t("settings.maxDiscountRate")} icon={<Percent size={13} />} hint={t("settings.maxDiscountRateHint")}>
                      <div className="flex items-center">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={form.maxDiscountRate ?? 100}
                          onChange={(e) => set("maxDiscountRate", Math.max(0, Math.min(100, Number(e.target.value))))}
                          className="rounded-tr-none rounded-br-none text-right"
                        />
                        <div className="h-10 px-3 bg-muted border border-l-0 border-input rounded-tr-md rounded-br-md text-xs text-muted-foreground flex items-center shrink-0">
                          %
                        </div>
                      </div>
                    </Field>

                    <Field label={t("settings.defaultMinStock")} icon={<Wallet size={13} />} hint={t("settings.defaultMinStockHint")}>
                      <Input
                        type="number"
                        min={0}
                        step={0.0001}
                        value={form.defaultMinStockQty ?? 0}
                        onChange={(e) => set("defaultMinStockQty", Math.max(0, Number(e.target.value)))}
                        className=""
                      />
                    </Field>

                    <Field label={t("settings.arApReminderDays")} icon={<Hash size={13} />} hint={t("settings.arApReminderDaysHint")} className="md:col-span-2">
                      <Input
                        value={(form.arReminderDays ?? [-3, 1, 7, 30]).join(", ")}
                        onChange={(e) => {
                          const parsed = e.target.value.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                          set("arReminderDays", parsed.length > 0 ? parsed : [-3, 1, 7, 30]);
                        }}
                        className=""
                        placeholder="-3, 1, 7, 30"
                      />
                    </Field>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoice" className="mt-0">
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      <FileText size={14} />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.invoiceSettings")}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{t("settings.invoiceSettingsDesc")}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Field label={t("settings.invoicePrefix")} icon={<Hash size={13} />} hint={t("settings.invoicePrefixHint")}>
                    <Input
                      value={form.invoicePrefix ?? ""}
                      onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase().slice(0, 5))}
                      className="w-32 text-xl tracking-[0.2em] text-center"
                      maxLength={5}
                      placeholder="FAT"
                    />
                  </Field>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {saveError && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertTitle className="text-xs font-semibold">Kaydetme Başarısız</AlertTitle>
              <AlertDescription className="text-xs">{saveError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Sağ Sütun */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 flex items-center gap-2">
              {t("settings.quickAccess")}
              <Separator className="flex-1" />
            </div>

            <div className="flex flex-col gap-2">
              <QuickCard href="/ayarlar/kullanicilar" icon={<UsersRound size={15} />} title={t("settings.teamMembers")} desc={t("settings.teamMembersDesc")} />
              <QuickCard href="/ayarlar/white-label"  icon={<Paintbrush size={15} />} title={t("settings.whiteLabel")}  desc={t("settings.whiteLabelDesc")} />
              <QuickCard href="/api-marketplace"      icon={<Key size={15} />}        title={t("settings.apiKeys")}     desc={t("settings.apiKeysDesc")} />
              <QuickCard href="/webhooks"             icon={<Webhook size={15} />}    title={t("settings.webhookHub")}  desc={t("settings.webhookHubDesc")} />
              <QuickCard href="/abonelik"             icon={<CreditCard size={15} />} title={t("settings.subscription")} desc={t("settings.subscriptionDesc")} />
              <QuickCard href="/ayarlar/doviz-kurlari" icon={<DollarSign size={15} />} title={t("settings.exchangeRates")} desc={t("settings.exchangeRatesDesc")} />
              <QuickCard href="/ayarlar/uae-kdv"      icon={<Globe size={15} />}     title={t("settings.uaeVat")}      desc={t("settings.uaeVatDesc")} />
              <QuickCard href="/ayarlar/ksa-zatca"    icon={<Shield size={15} />}    title={t("settings.ksaZatca")}    desc={t("settings.ksaZatcaDesc")} />
            </div>
          </div>

          {/* Tenant Paneli */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t("settings.tenantInfo")}
                </CardTitle>
                <Button variant="ghost" size="icon" className="size-6">
                  <ExternalLink size={11} className="text-muted-foreground" />
                </Button>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-lg font-bold text-foreground tracking-widest tabular-nums">
                    {tenantId ? tenantId.slice(0, 8).toUpperCase() : "DEMO"}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Workspace ID</span>
                </div>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {tenantTier.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-2">
              <Separator />
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UsersRound size={11} />
                    <span className="text-[10px] uppercase tracking-widest">User Account</span>
                  </div>
                  <span className="text-xs text-foreground truncate max-w-[140px]">
                    {session?.user?.email?.split("@")[0]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Landmark size={11} />
                    <span className="text-[10px] uppercase tracking-widest">Tax Status</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span className="text-[10px] uppercase tracking-tighter text-primary font-medium">Verified</span>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-0 border-t border-border">
              <Button variant="ghost" className="w-full h-10 rounded-none text-xs text-muted-foreground">
                View Billing Center
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
