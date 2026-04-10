"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  Building2,
  Crown,
  ChevronRight,
  X,
} from "lucide-react";
import {
  billingApi,
  type BillingPlan,
  type Subscription,
} from "@/services/billing";
import { useTenant } from "@/hooks/use-tenant";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate, formatCurrency, kurusToTl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const fmt = (k: number) => formatCurrency(kurusToTl(k));
const fmtDate = (iso: string | null) => (iso ? formatDate(iso) : "—");

function periodEnd(sub: Subscription): string {
  return fmtDate(sub.currentPeriodEnd ?? sub.trialEndsAt);
}

type SubStatus = Subscription["status"];

function getStatusBadgeProps(status: SubStatus, t: (key: string) => string): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
  icon: React.ReactNode;
  label: string;
} {
  const map: Record<SubStatus, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string; icon: React.ReactNode; label: string }> = {
    active:    { variant: "secondary", className: "bg-primary/10 text-primary border-transparent", icon: <CheckCircle2 size={12} />, label: t("billing.status.active") },
    trialing:  { variant: "secondary", icon: <Clock size={12} />, label: t("billing.status.trialing") },
    past_due:  { variant: "outline",   icon: <AlertTriangle size={12} />, label: t("billing.status.pastDue") },
    cancelled: { variant: "destructive", icon: <XCircle size={12} />, label: t("billing.status.cancelled") },
    expired:   { variant: "outline",   icon: <XCircle size={12} />, label: t("billing.status.expired") },
  };
  return map[status] ?? map["active"];
}

const TIER_ICON: Record<BillingPlan["tier"], React.ReactNode> = {
  starter:    <Zap size={16} className="text-muted-foreground" />,
  business:   <Building2 size={16} className="text-muted-foreground" />,
  enterprise: <Crown size={16} className="text-muted-foreground" />,
};

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function AbonelikPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { tenantId } = useTenant();

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [planModal, setPlanModal] = useState<BillingPlan | null>(null);
  const [cardModal, setCardModal] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ─── Sorgular ───────────────────────────────────────────────────────────

  const { data: plans = [] } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () =>
      billingApi.plans().then((r) => r.data).catch(() => [] as BillingPlan[]),
  });

  const { data: sub = null, isLoading: subLoading } = useQuery({
    queryKey: ["billing-sub", tenantId],
    queryFn: () =>
      tenantId
        ? billingApi.subscription(tenantId).then((r) => r.data).catch(() => null)
        : Promise.resolve(null),
    enabled: !!tenantId,
  });

  // ─── Mutasyonlar ────────────────────────────────────────────────────────

  const changePlan = useMutation({
    mutationFn: (planId: string) => billingApi.changePlan(tenantId!, { planId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-sub"] });
      setPlanModal(null);
      showToast(t("billing.planUpdated"), true);
    },
    onError: () => showToast(t("billing.planUpdateFailed"), false),
  });

  const cancelSub = useMutation({
    mutationFn: () => billingApi.cancel(tenantId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-sub"] });
      setCancelConfirm(false);
      showToast(t("billing.subscriptionCanceled"), true);
    },
    onError: () => showToast(t("billing.cancelFailed"), false),
  });

  const updateCard = useMutation({
    mutationFn: (card: Parameters<typeof billingApi.updateCard>[1]) =>
      billingApi.updateCard(tenantId!, card),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-sub"] });
      setCardModal(false);
      showToast(t("billing.cardUpdated"), true);
    },
    onError: () => showToast(t("billing.cardUpdateFailed"), false),
  });

  const currentPlan = sub ? plans.find((p) => p.id === sub.planId) : undefined;
  const statusInfo = sub
    ? getStatusBadgeProps(sub.status, t)
    : getStatusBadgeProps("trialing", t);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* ─── Başlık ─── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
          <CreditCard size={18} className="text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("billing.title")}
        </h1>
      </div>

      {/* ─── Mevcut Abonelik ─── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("billing.currentSubscription")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subLoading ? (
            <div className="h-16 rounded-lg bg-muted animate-pulse" />
          ) : !sub ? (
            <p className="text-sm text-muted-foreground py-4">
              {t("billing.noSubscription")}
            </p>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
                  {TIER_ICON[currentPlan?.tier ?? "starter"]}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground text-sm">
                      {currentPlan?.name ?? sub.planId}
                    </span>
                    <Badge
                      variant={statusInfo.variant}
                      className={`flex items-center gap-1 w-fit ${statusInfo.className ?? ""}`}
                    >
                      {statusInfo.icon}
                      {statusInfo.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.periodEnd")}{" "}
                    <span className="text-foreground tabular-nums">{periodEnd(sub)}</span>
                  </p>
                  {sub.iyzicoCardToken && (
                    <p className="text-xs text-muted-foreground">
                      {t("billing.paymentMethod")} <span className="text-foreground">{t("billing.cardRegistered")}</span>
                    </p>
                  )}
                  {sub.cancelAtPeriodEnd && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <AlertTriangle size={11} /> {t("billing.cancelAtPeriodEnd")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCardModal(true)}>
                  <CreditCard size={13} /> {t("billing.updateCard")}
                </Button>
                {!sub.cancelAtPeriodEnd &&
                  sub.status !== "cancelled" &&
                  sub.status !== "expired" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/10"
                      onClick={() => setCancelConfirm(true)}
                      isLoading={cancelSub.isPending}
                      disabled={cancelSub.isPending}
                    >
                      {!cancelSub.isPending && <X size={12} />}
                      {t("billing.cancelSubscription")}
                    </Button>
                  )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Plan Karşılaştırma ─── */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("billing.plans")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map((plan) => {
            const isCurrent = sub ? plan.id === sub.planId : false;
            const isUpgrade = sub
              ? plans.findIndex((p) => p.id === plan.id) >
                plans.findIndex((p) => p.id === sub.planId)
              : false;
            const savings =
              plan.annualPriceKurus > 0
                ? Math.round((1 - plan.annualPriceKurus / (plan.priceKurus * 12)) * 100)
                : 0;

            return (
              <Card
                key={plan.id}
                className={`shadow-sm relative flex flex-col gap-4 p-5 ${isCurrent ? "border-primary/30 bg-primary/5" : ""}`}
              >
                {isCurrent && (
                  <Badge
                    variant="secondary"
                    className="absolute top-3 right-3 bg-primary/10 text-primary border-transparent text-[10px]"
                  >
                    {t("billing.currentPlan")}
                  </Badge>
                )}

                <div className="flex items-center gap-2">
                  {TIER_ICON[plan.tier]}
                  <span className="font-semibold text-foreground text-sm">{plan.name}</span>
                </div>

                <div>
                  <p className="text-2xl font-bold text-foreground tabular-nums">
                    {fmt(plan.priceKurus)}
                    <span className="text-sm font-normal text-muted-foreground">{t("billing.perMonth")}</span>
                  </p>
                  {plan.annualPriceKurus > 0 && savings > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmt(plan.annualPriceKurus)}/yıl{" "}
                      <span className="text-primary">(% {savings} {t("billing.savings")})</span>
                    </p>
                  )}
                </div>

                <ul className="flex flex-col gap-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 size={12} className="text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <p className="text-xs text-muted-foreground">{t("billing.yourCurrentPlan")}</p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => setPlanModal(plan)}
                    disabled={changePlan.isPending || !tenantId}
                  >
                    {isUpgrade ? t("billing.upgrade") : t("billing.downgrade")} <ChevronRight size={12} />
                  </Button>
                )}
              </Card>
            );
          })}

          {plans.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              {t("billing.loadingPlans")}
            </div>
          )}
        </div>
      </div>

      {/* ─── Plan Değişikliği Modalı ─── */}
      <Dialog open={!!planModal} onOpenChange={(open) => { if (!open) setPlanModal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {planModal && (currentPlan?.priceKurus ?? 0) < planModal.priceKurus ? t("billing.planUpgrade") : t("billing.planChange")}
            </DialogTitle>
          </DialogHeader>
          {planModal && (
            <div className="flex flex-col gap-3 text-sm">
              {currentPlan && (
                <div className="flex justify-between p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">{t("billing.currentPlanLabel")}</span>
                  <span className="font-medium text-foreground">{currentPlan.name}</span>
                </div>
              )}
              <div className="flex justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-muted-foreground">{t("billing.newPlanLabel")}</span>
                <span className="font-semibold text-primary">{planModal.name}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {(currentPlan?.priceKurus ?? 0) < planModal.priceKurus
                  ? t("billing.upgradeText")
                  : t("billing.downgradeText")}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPlanModal(null)}>{t("billing.cancel")}</Button>
            <Button
              onClick={() => planModal && changePlan.mutate(planModal.id)}
              isLoading={changePlan.isPending}
              disabled={changePlan.isPending}
            >
              {(currentPlan?.priceKurus ?? 0) < (planModal?.priceKurus ?? 0) ? t("billing.upgrade") : t("billing.downgrade")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Kart Güncelleme Modalı ─── */}
      <Dialog open={cardModal} onOpenChange={setCardModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("billing.cardUpdate")}</DialogTitle>
          </DialogHeader>
          <CardUpdateForm
            t={t}
            isPending={updateCard.isPending}
            onSave={(data) => updateCard.mutate(data)}
            onClose={() => setCardModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ─── İptal Onay Modalı ─── */}
      <Dialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-muted-foreground" />
              {t("billing.cancelSubscription")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("billing.cancelConfirmText").replace("{periodEnd}", sub ? periodEnd(sub) : "—")}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelConfirm(false)}>{t("billing.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => cancelSub.mutate()}
              isLoading={cancelSub.isPending}
              disabled={cancelSub.isPending}
            >
              {t("billing.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Toast ─── */}
      {toast && (
        <Alert
          variant={toast.ok ? "default" : "destructive"}
          className={toast.ok ? "border-primary/30 bg-primary/10 text-primary" : undefined}
        >
          <AlertDescription>{toast.text}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ─── Kart Güncelleme Formu ────────────────────────────────────────────────────

function CardUpdateForm({
  isPending,
  onSave,
  onClose,
  t,
}: {
  isPending: boolean;
  onSave: (data: {
    cardHolderName: string;
    cardNumber: string;
    expireMonth: string;
    expireYear: string;
    cvc: string;
  }) => void;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [form, setForm] = useState({
    cardHolderName: "",
    cardNumber: "",
    expireMonth: "",
    expireYear: "",
    cvc: "",
  });
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const isValid = Object.values(form).every((v) => v.trim().length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{t("billing.cardHolder")}</Label>
        <Input
          placeholder="Ad Soyad"
          value={form.cardHolderName}
          onChange={set("cardHolderName")}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{t("billing.cardNumber")}</Label>
        <Input
          placeholder="•••• •••• •••• ••••"
          maxLength={19}
          className="tabular-nums"
          value={form.cardNumber}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 16);
            setForm((f) => ({ ...f, cardNumber: v.replace(/(.{4})/g, "$1 ").trim() }));
          }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t("billing.expiryMonth")}</Label>
          <Input placeholder="MM" maxLength={2} className="tabular-nums" value={form.expireMonth} onChange={set("expireMonth")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t("billing.expiryYear")}</Label>
          <Input placeholder="YY" maxLength={2} className="tabular-nums" value={form.expireYear} onChange={set("expireYear")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t("billing.cvc")}</Label>
          <Input placeholder="•••" maxLength={4} className="tabular-nums" value={form.cvc} onChange={set("cvc")} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("billing.cardSecure")}
      </p>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>{t("billing.cancel")}</Button>
        <Button
          onClick={() => onSave(form)}
          isLoading={isPending}
          disabled={isPending || !isValid}
        >
          {t("billing.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}
