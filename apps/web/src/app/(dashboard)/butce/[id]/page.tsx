"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Check,
  AlertCircle,
  Plus,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  budgetApi,
  MONTHS,
  type Budget,
  type BudgetLine,
  type VarianceLine,
} from "@/services/budget";
import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, kurusToTl, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

const fmtTry   = (k: number) => formatCurrency(kurusToTl(k));
const fmtShort = (k: number) => formatNumber(Math.round(kurusToTl(k)));

/* ─── Add Line Form ──────────────────────────────────────────────── */
function AddLineForm({
  budgetId,
  onSuccess,
  t,
}: {
  budgetId: string;
  onSuccess: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const [open, setOpen] = useState(false);
  const emptyLine = {
    accountCode: "",
    accountName: "",
    ...Object.fromEntries(MONTHS.map((m) => [m, ""])),
  };
  const [form, setForm] = useState<Record<string, string>>(emptyLine);

  const mutation = useMutation({
    mutationFn: () =>
      budgetApi.upsertLine(budgetId, {
        accountCode: form.accountCode,
        accountName: form.accountName,
        ...Object.fromEntries(
          MONTHS.map((m) => [m, Math.round(parseFloat(form[m] || "0") * 100)]),
        ),
      }),
    onSuccess: () => {
      setForm(emptyLine);
      setOpen(false);
      onSuccess();
    },
    onError: () => toast.error(t("common.errorOccurred")),
  });

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus size={12} /> {t("finance.budget.addLine")}
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg bg-muted/50 border border-border p-3">
      <div className="flex flex-wrap gap-2 mb-2.5">
        <Input
          className="w-[90px] h-8 text-xs "
          placeholder={t("finance.budget.accountCode")}
          value={form.accountCode}
          onChange={(e) =>
            setForm((f) => ({ ...f, accountCode: e.target.value }))
          }
        />
        <Input
          className="flex-1 min-w-[160px] h-8 text-xs"
          placeholder={t("finance.budget.accountName")}
          value={form.accountName}
          onChange={(e) =>
            setForm((f) => ({ ...f, accountName: e.target.value }))
          }
        />
        {MONTHS.map((m) => (
          <Input
            key={m}
            type="number"
            className="w-[72px] h-8 text-xs text-right "
            placeholder={t(`finance.budget.months.${m}`)}
            value={form[m]}
            onChange={(e) => setForm((f) => ({ ...f, [m]: e.target.value }))}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="text-xs"
          disabled={!form.accountCode || !form.accountName || mutation.isPending}
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t("finance.budget.save")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setOpen(false)}
        >
          {t("finance.budget.cancel")}
        </Button>
      </div>
    </div>
  );
}

/* ─── Budget Lines Section ───────────────────────────────────────── */
function BudgetLinesSection({
  lines,
  budget,
  onLineAdded,
  t,
}: {
  lines: BudgetLine[];
  budget: Budget;
  onLineAdded: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const totalAnnual = lines.reduce((s, l) => s + Number(l.annualTotalKurus), 0);

  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t("finance.budget.budgetLines")}
          </span>
          <Badge variant="secondary" className="text-[10px] h-5 rounded-full px-2">
            {lines.length}
          </Badge>
        </div>
        <span className="text-sm font-bold text-primary tabular-nums">
          {fmtTry(totalAnnual)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[960px] text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px] text-[11px] font-medium tracking-wide uppercase">
                {t("finance.budget.accountCode")}
              </TableHead>
              <TableHead className="w-[180px] text-[11px] font-medium tracking-wide uppercase">
                {t("finance.budget.accountName")}
              </TableHead>
              {MONTHS.map((m) => (
                <TableHead
                  key={m}
                  className="text-right w-[66px] text-[11px] font-medium"
                >
                  {t(`finance.budget.months.${m}`)}
                </TableHead>
              ))}
              <TableHead className="text-right text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap">
                {t("finance.budget.annual")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-semibold text-primary">
                  {l.accountCode}
                </TableCell>
                <TableCell className="text-foreground">{l.accountName}</TableCell>
                {MONTHS.map((m) => {
                  const val = Number(
                    (l as unknown as Record<string, number>)[m] ?? 0,
                  );
                  return (
                    <TableCell key={m} className="text-right tabular-nums">
                      {val > 0 ? (
                        <span className="text-foreground">{fmtShort(val)}</span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold text-foreground tabular-nums">
                  {fmtTry(l.annualTotalKurus)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold text-muted-foreground text-xs">
                {t("finance.budget.total")}
              </TableCell>
              {MONTHS.map((m) => {
                const monthTotal = lines.reduce(
                  (s, l) =>
                    s + Number((l as unknown as Record<string, number>)[m] ?? 0),
                  0,
                );
                return (
                  <TableCell key={m} className="text-right font-semibold text-foreground tabular-nums">
                    {monthTotal > 0 ? fmtShort(monthTotal) : ""}
                  </TableCell>
                );
              })}
              <TableCell className="text-right font-bold text-primary tabular-nums text-sm">
                {fmtTry(totalAnnual)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {!budget.isApproved && (
        <div className="px-4 pb-4">
          <AddLineForm budgetId={budget.id} onSuccess={onLineAdded} t={t} />
        </div>
      )}
    </Card>
  );
}

/* ─── Variance Section ───────────────────────────────────────────── */
function VarianceSection({
  budgetId,
  t,
}: {
  budgetId: string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const [open, setOpen] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);

  const { data: report, isLoading } = useQuery({
    queryKey: ["budget-variance", budgetId, selectedMonth],
    queryFn: () =>
      budgetApi.variance(budgetId, selectedMonth).then((r) => r.data),
    enabled: open,
  });

  const lines: VarianceLine[] = report?.lines ?? [];

  return (
    <Card className="shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp size={15} className="text-primary" />
          {t("finance.budget.varianceSection")}
        </div>
        {open ? (
          <ChevronUp size={15} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={15} className="text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Ay filtresi */}
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-3 border-b border-border">
            <span className="text-xs text-muted-foreground mr-1">
              {t("finance.budget.period")}
            </span>
            <button
              onClick={() => setSelectedMonth(undefined)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs border transition-colors",
                selectedMonth === undefined
                  ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t("finance.budget.annual")}
            </button>
            {MONTHS.map((m, idx) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(idx + 1)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs border transition-colors",
                  selectedMonth === idx + 1
                    ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`finance.budget.months.${m}`)}
              </button>
            ))}
          </div>

          {/* Özet KPI'lar */}
          {report && (
            <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
              {[
                {
                  label: t("finance.budget.planned"),
                  value: fmtTry(report.totalPlanned),
                  neutral: true,
                  over: false,
                },
                {
                  label: t("finance.budget.actualLabel"),
                  value: fmtTry(report.totalActual),
                  neutral: true,
                  over: false,
                },
                {
                  label: t("finance.budget.variance"),
                  value: fmtTry(report.totalActual - report.totalPlanned),
                  neutral: false,
                  over: report.totalActual > report.totalPlanned,
                },
                {
                  label: t("finance.budget.variancePct"),
                  value:
                    report.totalPlanned > 0
                      ? `%${Math.abs(
                          ((report.totalActual - report.totalPlanned) /
                            report.totalPlanned) *
                            100,
                        ).toFixed(1)}`
                      : "—",
                  neutral: false,
                  over: report.totalActual > report.totalPlanned,
                },
              ].map((kpi) => (
                <div key={kpi.label} className="p-3.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-1">
                    {kpi.label}
                  </p>
                  <p
                    className={cn(
                      "text-base font-bold tabular-nums",
                      kpi.neutral
                        ? "text-foreground"
                        : kpi.over
                          ? "text-destructive"
                          : "text-primary",
                    )}
                  >
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="p-5 text-sm text-muted-foreground">
              {t("finance.budget.loading")}
            </div>
          )}
          {!isLoading && lines.length === 0 && (
            <div className="p-5 text-sm text-muted-foreground">
              {t("finance.budget.noVarianceData")}
            </div>
          )}

          {/* Varyans tablosu */}
          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    {[
                      t("finance.budget.accountCode"),
                      t("finance.budget.accountName"),
                      t("finance.budget.planned"),
                      t("finance.budget.actualLabel"),
                      t("finance.budget.variance"),
                      t("finance.budget.variancePct"),
                    ].map((h, idx) => (
                      <TableHead
                        key={h}
                        className={cn(
                          "text-[11px] font-medium uppercase tracking-wide whitespace-nowrap",
                          idx >= 2 && "text-right",
                        )}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => {
                    const isOver = line.variance > 0;
                    const absVariancePct = Math.abs(line.variancePct);
                    return (
                      <TableRow key={i} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-semibold text-primary">
                          {line.accountCode}
                        </TableCell>
                        <TableCell className="text-foreground">{line.accountName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtTry(line.planned)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtTry(line.actual)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "font-semibold tabular-nums",
                              isOver ? "text-destructive" : "text-primary",
                            )}
                          >
                            {isOver ? "+" : ""}
                            {fmtTry(line.variance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isOver ? (
                              <TrendingUp size={12} className="text-destructive" />
                            ) : (
                              <TrendingDown size={12} className="text-primary" />
                            )}
                            <span
                              className={cn(
                                "font-semibold tabular-nums",
                                isOver ? "text-destructive" : "text-primary",
                              )}
                            >
                              %{absVariancePct.toFixed(1)}
                            </span>
                            {/* Varyans barı — width dinamik, renk semantic token */}
                            <div className="w-12 h-1 bg-muted rounded-sm overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-sm",
                                  isOver ? "bg-destructive" : "bg-primary",
                                )}
                                style={{ width: `${Math.min(absVariancePct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ButceDetayPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmApprove, setConfirmApprove] = useState(false);

  const {
    data: budget,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["budget", id],
    queryFn: () =>
      budgetApi
        .get(id)
        .then((r) => r.data as Budget & { lines?: BudgetLine[] }),
    enabled: !!id,
  });

  const approveMut = useMutation({
    mutationFn: () => budgetApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", id] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success(t("finance.budget.budgetApproved"));
      setConfirmApprove(false);
    },
    onError: () => toast.error(t("common.errorOccurred")),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-6 w-56 bg-muted rounded animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-96 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (isError || !budget) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-8 flex flex-col items-center gap-4">
          <AlertCircle size={32} className="text-destructive" />
          <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>
          <Button variant="ghost" size="sm" onClick={() => router.push("/butce")}>
            {t("common.back")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lines: BudgetLine[] = budget.lines ?? [];
  const totalAnnual = lines.reduce((s, l) => s + Number(l.annualTotalKurus), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Üst başlık */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/butce"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <BarChart3 size={18} className="text-primary" />
              <h1 className="text-xl font-bold text-foreground">{budget.name}</h1>
              <Badge variant={budget.isApproved ? "secondary" : "outline"}>
                {budget.isApproved
                  ? t("finance.budget.approvedStatus")
                  : t("finance.budget.draftStatus")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-[26px]">
              {budget.year} {t("finance.budget.yearBudget")} {budget.version}
              {budget.approvedBy &&
                ` · ${t("finance.budget.approvedBy")}: ${budget.approvedBy}`}
            </p>
          </div>
        </div>

        {!budget.isApproved && (
          <Button
            className="gap-1.5 shrink-0"
            disabled={approveMut.isPending}
            onClick={() => setConfirmApprove(true)}
          >
            <Check size={14} /> {t("finance.budget.approveBudget")}
          </Button>
        )}
      </div>

      {/* KPI satırı */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: t("finance.budget.annualBudget"),
            value: fmtTry(totalAnnual),
            accent: true,
            sub: `${lines.length} ${t("finance.budget.accountItems")}`,
          },
          { label: t("finance.budget.year"),    value: String(budget.year),    accent: false },
          { label: t("finance.budget.version"), value: String(budget.version), accent: false },
          { label: t("finance.budget.monthlyAverage"), value: fmtTry(totalAnnual / 12), accent: false },
        ].map((kpi) => (
          <Card key={kpi.label} className="shadow-sm">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium mb-1.5">
                {kpi.label}
              </p>
              <p
                className={cn(
                  "text-xl font-bold tabular-nums",
                  kpi.accent ? "text-primary" : "text-foreground",
                )}
              >
                {kpi.value}
              </p>
              {"sub" in kpi && kpi.sub && (
                <p className="text-[11px] text-muted-foreground mt-1">{kpi.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Notlar */}
      {budget.notes && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
              {t("finance.budget.notes")}
            </p>
            <p className="text-sm text-foreground leading-relaxed">{budget.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Bütçe kalemleri tablosu */}
      <BudgetLinesSection
        lines={lines}
        budget={budget}
        onLineAdded={() => qc.invalidateQueries({ queryKey: ["budget", id] })}
        t={t}
      />

      {/* Varyans analizi */}
      <VarianceSection budgetId={id} t={t} />

      {/* Bütçe onay diyaloğu */}
      <Dialog
        open={confirmApprove}
        onOpenChange={(v) => !v && setConfirmApprove(false)}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <div className="p-2 rounded-lg bg-muted w-fit mb-2">
              <Check size={16} className="text-primary" />
            </div>
            <DialogTitle className="text-base font-semibold">
              {t("finance.budget.approveBudget")}
            </DialogTitle>
            <DialogDescription>
              {t("finance.budget.approveConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmApprove(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              isLoading={approveMut.isPending}
              onClick={() => approveMut.mutate()}
            >
              {t("finance.budget.approveBudget")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
