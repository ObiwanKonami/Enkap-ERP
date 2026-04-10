"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  BarChart3,
  Plus,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  X,
} from "lucide-react";
import {
  budgetApi,
  MONTHS,
  type Budget,
  type BudgetLine,
} from "@/services/budget";
import { formatCurrency, kurusToTl, formatDate } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const LIMIT = 20;

// ─── Status Badge Yardımcısı ──────────────────────────────────────────────────

function StatusBadge({ isApproved, t }: { isApproved: boolean; t: (k: string) => string }) {
  return (
    <Badge
      variant={isApproved ? "secondary" : "outline"}
      className="text-[10px] uppercase tracking-wider px-2 py-0"
    >
      {isApproved ? t("finance.budget.approvedStatus") : t("finance.budget.draftStatus")}
    </Badge>
  );
}

// ─── Budget Detail Dialog ─────────────────────────────────────────────────────

function BudgetDetailDialog({
  budget,
  open,
  onClose,
  t,
}: {
  budget: Budget | null;
  open: boolean;
  onClose: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [newLine, setNewLine] = useState({
    accountCode: "",
    accountName: "",
    ...Object.fromEntries(MONTHS.map((m) => [m, 0])),
  });

  const { data: detail, isLoading } = useQuery({
    queryKey: ["budget-detail", budget?.id],
    queryFn: () =>
      budgetApi.get(budget!.id).then((r) => r.data as Budget & { lines: BudgetLine[] }),
    enabled: !!budget?.id,
  });

  const upsertMutation = useMutation({
    mutationFn: () => budgetApi.upsertLine(budget!.id, newLine),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-detail", budget?.id] });
      setEditMode(false);
      setNewLine({ accountCode: "", accountName: "", ...Object.fromEntries(MONTHS.map((m) => [m, 0])) });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => budgetApi.approve(budget!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["budget-detail", budget?.id] });
    },
  });

  const lines: BudgetLine[] = (detail as unknown as { lines?: BudgetLine[] })?.lines ?? [];
  const totalAnnual = lines.reduce((s, l) => s + Number(l.annualTotalKurus), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[96vw] w-[980px] max-h-[90vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <BarChart3 size={16} className="text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold">{budget?.name}</DialogTitle>
                {budget && <StatusBadge isApproved={budget.isApproved} t={t} />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {budget?.year} / {budget?.version}
                {budget?.approvedAt && ` — ${t("finance.budget.approvedAt")} ${formatDate(budget.approvedAt)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {budget && !budget.isApproved && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-primary hover:text-primary hover:bg-primary/10"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {t("finance.budget.approveBudget")}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
                <p className="text-sm">{t("finance.budget.loading")}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-semibold w-24">{t("finance.budget.accountCode")}</TableHead>
                        <TableHead className="font-semibold w-44">{t("finance.budget.accountName")}</TableHead>
                        {MONTHS.map((m) => (
                          <TableHead key={m} className="text-right font-semibold text-[11px] px-1 w-16">
                            {t(`finance.budget.months.${m}`)}
                          </TableHead>
                        ))}
                        <TableHead className="text-right font-semibold">{t("finance.budget.annual")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => (
                        <TableRow key={l.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-primary font-semibold tabular-nums text-xs py-2">
                            {l.accountCode}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground py-2">
                            {l.accountName}
                          </TableCell>
                          {MONTHS.map((m) => {
                            const val = Number((l as unknown as Record<string, number>)[m]) || 0;
                            return (
                              <TableCell key={m} className="text-right text-[11px] tabular-nums py-2 px-1">
                                {val > 0 ? (
                                  (val / 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-semibold tabular-nums py-2">
                            {formatCurrency(kurusToTl(l.annualTotalKurus))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-primary/5">
                        <TableCell colSpan={2} className="font-bold text-xs uppercase tracking-wider text-muted-foreground py-2.5">
                          {t("finance.budget.total")}
                        </TableCell>
                        {MONTHS.map((m) => {
                          const monthTotal = lines.reduce(
                            (s, l) => s + Number((l as unknown as Record<string, number>)[m] ?? 0), 0
                          );
                          return (
                            <TableCell key={m} className="text-right font-bold tabular-nums text-foreground text-[11px] py-2.5 px-1">
                              {monthTotal > 0 ? (monthTotal / 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) : ""}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right text-primary font-bold tabular-nums py-2.5">
                          {formatCurrency(kurusToTl(totalAnnual))}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {/* Yeni Kalem Ekle */}
                {budget && !budget.isApproved && (
                  <div className="mt-4">
                    {editMode ? (
                      <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Input
                            className="w-24 h-8 text-xs bg-muted/40"
                            placeholder={t("finance.budget.accountCode")}
                            value={newLine.accountCode}
                            onChange={(e) => setNewLine((f) => ({ ...f, accountCode: e.target.value }))}
                          />
                          <Input
                            className="flex-1 min-w-[150px] h-8 text-xs bg-muted/40"
                            placeholder={t("finance.budget.accountName")}
                            value={newLine.accountName}
                            onChange={(e) => setNewLine((f) => ({ ...f, accountName: e.target.value }))}
                          />
                          {MONTHS.map((m) => (
                            <Input
                              key={m}
                              type="number"
                              className="w-16 h-8 text-xs text-right tabular-nums bg-muted/40"
                              placeholder={t(`finance.budget.months.${m}`)}
                              value={((newLine as Record<string, unknown>)[m] as number) || ""}
                              onChange={(e) => setNewLine((f) => ({ ...f, [m]: Number(e.target.value) * 100 }))}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => upsertMutation.mutate()}
                            disabled={upsertMutation.isPending || !newLine.accountCode}
                          >
                            {upsertMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            {t("finance.budget.saveLine")}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditMode(false)}>
                            {t("finance.budget.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-8 gap-1.5 text-xs text-muted-foreground"
                        onClick={() => setEditMode(true)}
                      >
                        <Plus size={13} /> {t("finance.budget.addLine")}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Yeni Bütçe Dialog ────────────────────────────────────────────────────────

function NewBudgetDialog({
  open,
  onClose,
  onSuccess,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    year: currentYear,
    version: "v1",
    name: `${currentYear} Yılı Bütçesi`,
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: () => budgetApi.create(form),
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            {t("finance.budget.newBudgetPeriod")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.budget.year")} *
              </Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  year: Number(e.target.value),
                  name: `${e.target.value} Yılı Bütçesi`,
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.budget.version")}
              </Label>
              <Input
                placeholder="v1"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.budget.budgetName")} *
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.budget.notes")}
            </Label>
            <Textarea
              className="resize-y"
              rows={3}
              placeholder={t("finance.budget.notesPlaceholder")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {mutation.error && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription>{String((mutation.error as Error).message)}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("finance.budget.cancel")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.name}
            >
              {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {t("finance.budget.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ButcePage() {
  const { t } = useI18n();
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Budget | null>(null);
  const qc = useQueryClient();

  function changeYearFilter(y: number) {
    setYearFilter(y);
    setPage(1);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["budgets", yearFilter, page],
    queryFn: () => budgetApi.list({ year: yearFilter, limit: LIMIT, offset: (page - 1) * LIMIT }).then((r) => r.data),
  });

  const budgets: Budget[] = Array.isArray(data)
    ? data
    : ((data as { data?: Budget[] })?.data ?? []);
  const total = (data as { total?: number } | null)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("finance.budget.management")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(yearFilter)} onValueChange={(v) => changeYearFilter(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="h-9 gap-2 shadow-sm" onClick={() => setShowNew(true)}>
            <Plus size={14} /> {t("finance.budget.newBudget")}
          </Button>
        </div>
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("finance.budget.totalBudget"),  value: String(budgets.length),                                    className: "text-primary"    },
          { label: t("finance.budget.approved"),     value: String(budgets.filter((b) => b.isApproved).length),        className: "text-foreground" },
          { label: t("finance.budget.draft"),        value: String(budgets.filter((b) => !b.isApproved).length),       className: "text-muted-foreground"  },
          { label: t("finance.budget.activeYear"),   value: String(yearFilter),                                        className: "text-foreground"  },
        ].map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold tabular-nums tracking-tight", k.className)}>
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bütçe Tablosu */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 h-48 text-destructive">
              <AlertCircle size={20} />
              <span className="text-sm">{t("finance.budget.loadFailed")}</span>
            </div>
          ) : budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 h-48 text-muted-foreground">
              <BarChart3 size={32} className="opacity-20" />
              <p className="text-sm">{yearFilter} {t("finance.budget.noBudgetForYear")}</p>
              <p className="text-xs opacity-70">{t("finance.budget.createBudgetHint")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">{t("finance.budget.budgetName")}</TableHead>
                  <TableHead className="font-semibold w-20">{t("finance.budget.year")}</TableHead>
                  <TableHead className="font-semibold w-20">{t("finance.budget.version")}</TableHead>
                  <TableHead className="font-semibold w-28">{t("finance.budget.status")}</TableHead>
                  <TableHead className="font-semibold w-32">{t("finance.budget.approvalDate")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelected(b)}
                  >
                    <TableCell>
                      <p className="font-semibold text-sm text-foreground">{b.name}</p>
                      {b.notes && <p className="text-xs text-muted-foreground mt-0.5">{b.notes}</p>}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{b.year}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.version}</TableCell>
                    <TableCell><StatusBadge isApproved={b.isApproved} t={t} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {b.approvedAt ? formatDate(b.approvedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" asChild className="h-7 gap-1.5 text-xs text-primary bg-primary/5 hover:bg-primary/10">
                        <Link href={`/butce/${b.id}`}>
                          <ExternalLink size={11} /> {t("finance.budget.detail")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} {t("common.record")}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const n = start + i;
                if (n > totalPages) return null;
                return (
                  <PaginationItem key={n}>
                    <PaginationLink
                      href="#"
                      isActive={n === page}
                      onClick={(e) => { e.preventDefault(); setPage(n); }}
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Modaller */}
      <BudgetDetailDialog
        budget={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        t={t}
      />
      <NewBudgetDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["budgets"] });
          toast.success(t("finance.budget.budgetApproved"));
        }}
        t={t}
      />
    </div>
  );
}
