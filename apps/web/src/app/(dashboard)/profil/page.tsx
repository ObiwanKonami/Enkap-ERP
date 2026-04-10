"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";
import Link from "next/link";
import { useI18n } from "@/hooks/use-i18n";
import {
  User,
  Mail,
  Building2,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  CreditCard,
  Clock,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Şifre Güçlülük Göstergesi ───────────────────────────────────────────────

function PasswordStrength({ password, t }: { password: string; t: (key: string) => string }) {
  if (!password) return null;
  const checks = [
    { label: t("profile.passwordStrength.min8"),      ok: password.length >= 8 },
    { label: t("profile.passwordStrength.uppercase"),  ok: /[A-Z]/.test(password) },
    { label: t("profile.passwordStrength.lowercase"),  ok: /[a-z]/.test(password) },
    { label: t("profile.passwordStrength.number"),     ok: /[\d\W]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "flex-1 h-1 rounded-full transition-colors",
              i < score
                ? score <= 1 ? "bg-destructive"
                  : score <= 2 ? "bg-muted-foreground"
                  : "bg-primary"
                : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map((c) => (
          <span
            key={c.label}
            className={cn(
              "flex items-center gap-1 text-[10px]",
              c.ok ? "text-primary" : "text-muted-foreground"
            )}
          >
            {c.ok
              ? <CheckCircle2 size={9} />
              : <span className="size-2 rounded-full border border-muted-foreground inline-block" />
            }
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Şifre Input ─────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, id }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  id: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
        autoComplete="new-password"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </Button>
    </div>
  );
}

// ─── Bilgi Satırı ─────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value, mono = false }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="w-7 flex justify-center text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
        <p className={cn("text-sm text-foreground font-medium", mono && "")}>{value}</p>
      </div>
    </div>
  );
}

// ─── Plan Rengi ───────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  starter:    "Starter",
  business:   "Business",
  enterprise: "Enterprise",
};

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ProfilPage() {
  const { t } = useI18n();
  const { data: session } = useSession();

  const user = session?.user as {
    email?: string;
    tenantId?: string;
    tenantTier?: string;
    roles?: string[];
  } | undefined;

  const email    = user?.email      ?? "—";
  const tenantId = user?.tenantId   ?? "—";
  const tier     = user?.tenantTier ?? "starter";
  const roles    = (user?.roles ?? []).join(", ") || "Kullanıcı";
  const tierLabel = TIER_LABEL[tier] ?? "Starter";

  const [current, setCurrent] = useState("");
  const [next,    setNext   ] = useState("");
  const [confirm, setConfirm] = useState("");

  const isStrong =
    next.length >= 8 &&
    /[A-Z]/.test(next) &&
    /[a-z]/.test(next) &&
    /[\d\W]/.test(next);
  const matches  = next === confirm;
  const canChange = !!current && isStrong && matches;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      axios.post("/api/auth-svc/auth/change-password", {
        currentPassword: current,
        newPassword: next,
      }),
    onSuccess: () => {
      toast.success(t("profile.successMsg"));
      setCurrent(""); setNext(""); setConfirm("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? t("profile.errorMsg");
      toast.error(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canChange) return;
    mutate();
  }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <User size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("profile.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("profile.description")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
        {/* Sol: Hesap Bilgileri */}
        <div className="flex flex-col gap-4">
          {/* Avatar + özet */}
          <Card className="shadow-sm">
            <CardContent className="p-5 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-xl bg-muted flex items-center justify-center text-xl font-bold text-foreground shrink-0">
                  {email[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {email.split("@")[0]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                  <div className="mt-1.5">
                    <Badge variant="secondary" className="text-[10px] h-5">{tierLabel}</Badge>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <InfoRow icon={<Mail size={13} />}      label={t("auth.email")}    value={email} />
                <InfoRow icon={<Building2 size={13} />} label={t("common.code")}   value={tenantId} mono />
                <InfoRow icon={<CreditCard size={13} />} label={t("common.plan")}  value={tierLabel} />
                <InfoRow icon={<Shield size={13} />}    label={t("hr.position")}   value={roles} />
                <div className="flex items-center gap-3 pt-3">
                  <div className="w-7 flex justify-center text-muted-foreground shrink-0">
                    <Clock size={13} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">{t("profile.sessionStart")}</p>
                    <p className="text-sm text-foreground font-medium">
                      {new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Güvenlik notu */}
          <Card className="shadow-sm">
            <CardContent className="p-4 flex gap-3">
              <Lock size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("profile.kvkkNotice")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sağ: Şifre Değiştir */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">{t("profile.changePassword")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cur-pw" className="text-xs text-muted-foreground">
                  {t("profile.currentPassword")}
                </Label>
                <PasswordInput id="cur-pw" value={current} onChange={setCurrent} placeholder="••••••••" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-pw" className="text-xs text-muted-foreground">
                  {t("profile.newPassword")}
                </Label>
                <PasswordInput id="new-pw" value={next} onChange={setNext} placeholder="••••••••" />
                <PasswordStrength password={next} t={t} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf-pw" className="text-xs text-muted-foreground">
                  {t("profile.confirmPassword")}
                </Label>
                <PasswordInput id="cf-pw" value={confirm} onChange={setConfirm} placeholder="••••••••" />
                {confirm && !matches && (
                  <p className="text-[11px] text-destructive mt-1">{t("profile.passwordMismatch")}</p>
                )}
                {confirm && matches && next && (
                  <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                    <CheckCircle2 size={10} /> {t("profile.passwordMatch")}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={!canChange || isPending}
                isLoading={isPending}
                className="w-full gap-2 mt-1"
              >
                <KeyRound size={13} />
                {t("profile.saveButton")}
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t border-border text-center">
              <Link
                href="/sifre-sifirla"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("profile.forgotPassword")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
