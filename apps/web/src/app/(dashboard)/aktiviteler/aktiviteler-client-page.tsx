'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { crmApi } from '@/services/crm';
import type { ActivityType } from '@/services/crm';
import { useI18n } from '@/hooks/use-i18n';
import { DataTable } from '@/components/ui/data-table';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Search,
  Save,
  AlertCircle as AlertCircleIcon,
  Loader2,
  Phone,
  Mail,
  Users,
  CheckSquare,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildAktiviteColumns, AktiviteRow } from './aktiviteler-table';

const LIMIT = 20;
const ACTIVITY_TYPES: ActivityType[] = ["CALL", "EMAIL", "MEETING", "TASK"];

const TYPE_CONFIG = {
  CALL:    { color: "text-primary",     bg: "bg-primary/10",     border: "border-primary/20",    icon: Phone },
  EMAIL:   { color: "text-primary",    bg: "bg-primary/10",     border: "border-primary/20",    icon: Mail },
  MEETING: { color: "text-primary",    bg: "bg-primary/10",     border: "border-primary/20",    icon: Users },
  TASK:    { color: "text-primary",    bg: "bg-primary/10",     border: "border-primary/20",    icon: CheckSquare },
  NOTE:    { color: "text-primary",    bg: "bg-primary/10",     border: "border-primary/20",    icon: CheckSquare },
};

function ContactSearchInput({
  value,
  onChange,
  t,
}: {
  value: { id: string; name: string } | null;
  onChange: (c: { id: string; name: string } | null) => void;
  t: (key: string) => string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.length >= 1) {
      setIsLoading(true);
      crmApi.contacts.list({ q, limit: 8 })
        .then(r => {
          const data = r.data?.data ?? r.data;
          setContacts(Array.isArray(data) ? data : []);
        })
        .catch(() => setContacts([]))
        .finally(() => setIsLoading(false));
    } else {
      setContacts([]);
    }
  }, [q]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md border border-primary/30 bg-primary/10 text-primary text-sm">
        <span className="font-semibold">{value.name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 hover:bg-primary/20 hover:text-primary"
          onClick={() => {
            onChange(null);
            setQ("");
          }}
        >
          <X size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 h-9 bg-muted/40 text-sm focus-visible:ring-sky-500/30 font-medium"
          placeholder={t("activity.searchContact")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (contacts.length > 0 || isLoading) && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 shadow-xl border-primary/20 max-h-48 overflow-y-auto">
          <CardContent className="p-1">
            {isLoading ? (
              <div className="p-2 text-xs text-muted-foreground">Yükleniyor...</div>
            ) : (
              contacts.map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  className="w-full justify-start py-2 px-3 text-sm h-auto font-normal rounded-sm hover:bg-primary/10 hover:text-primary"
                  onMouseDown={() => {
                    onChange({ id: c.id, name: c.name });
                    setQ("");
                    setOpen(false);
                  }}
                >
                  {c.name}
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateActivityModal({
  open,
  onClose,
  onSaved,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [actType, setActType] = useState<ActivityType>("CALL");
  const [subject, setSubject] = useState("");
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = subject.trim().length >= 3;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setFormError("");
    try {
      await crmApi.activities.create({
        type: actType,
        subject: subject.trim(),
        contactId: contact?.id,
        contactName: contact?.name,
        dueDate: new Date(dueDate).toISOString(),
        status: "PENDING",
        notes: notes || undefined,
      });
      onSaved();
      onClose();
      resetForm();
    } catch {
      setFormError(t("activity.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setActType("CALL");
    setSubject("");
    setContact(null);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setDueDate(d.toISOString().slice(0, 16));
    setNotes("");
    setFormError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden shadow-2xl border-primary/20">
        <DialogHeader className="px-6 py-4 bg-muted/50 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Activity size={16} className="text-primary" />
            </div>
            {t("activity.newActivity")}
          </DialogTitle>
        </DialogHeader>

        <CardContent className="px-6 py-5 flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("activity.activityType")}
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {ACTIVITY_TYPES.map((type) => {
                const cfg = TYPE_CONFIG[type];
                const Icon = cfg.icon;
                const isSelected = actType === type;
                return (
                  <Button
                    key={type}
                    variant="outline"
                    className={cn(
                      "flex flex-col items-center gap-1.5 h-auto py-3 px-1.5 rounded-xl transition-all font-bold",
                      isSelected 
                        ? cn(cfg.bg, cfg.color, cfg.border) 
                        : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50"
                    )}
                    onClick={() => setActType(type)}
                  >
                    <Icon size={16} />
                    <span className="text-[10px] uppercase tracking-tighter truncate w-full text-center">
                      {t(`activity.type.${type}`)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("activity.subject")}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              className="h-9 bg-muted/40 text-sm focus-visible:ring-sky-500/30 font-medium shadow-none"
              placeholder={t("activity.subjectPlaceholder")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("activity.relatedContact")}
              <span className="text-[9px] lowercase font-normal leading-none inline-block ml-1 opacity-60">
                ({t("activity.contactOptional")})
              </span>
            </Label>
            <ContactSearchInput value={contact} onChange={setContact} t={t} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("activity.dueDateTime")}
            </Label>
            <Input
              className="h-9 bg-muted/40 text-sm shadow-none"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("activity.notes")}
            </Label>
            <Textarea
              className="bg-muted/40 text-sm shadow-none min-h-[80px] focus-visible:ring-sky-500/30"
              placeholder={t("activity.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {formError && (
            <Alert variant="destructive" className="py-2">
              <AlertCircleIcon size={14} />
              <AlertDescription className="text-xs font-medium">
                {formError}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <DialogFooter className="px-6 py-4 bg-muted/50 border-t border-border/50 gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            {t("activity.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
            className="min-w-[120px] gap-2 shadow-sm font-bold"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                {t("activity.creating")}
              </>
            ) : (
              <>
                <Save size={14} />
                {t("activity.create")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  variant: "primary" | "destructive";
}) {
  const variants = {
    primary: "border-border text-foreground",
    destructive: "border-destructive/30 text-destructive",
  };
  return (
    <Card className={cn("shadow-sm flex-1", variants[variant])}>
      <CardContent className="pt-4 pb-3 flex items-center gap-3">
        <div className="shrink-0 opacity-70">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest leading-none mb-1 opacity-70">
            {label}
          </p>
          <p className="text-xl font-black tracking-tighter tabular-nums leading-none">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AktivitelerClientPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [data, setData] = useState<AktiviteRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = {
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
        };
        
        if (statusFilter !== "ALL") {
          params.status = statusFilter;
        }

        if (debouncedSearch) {
          params.q = debouncedSearch;
        }

        const res = await crmApi.activities.list(params);
        const response = res as unknown as { data: AktiviteRow[]; total: number };
        const items = Array.isArray(response?.data) ? response.data : [];
        setData(items);
        setTotalCount(response?.total ?? 0);
      } catch (err) {
        setError(t("activity.connectionError"));
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [page, statusFilter, debouncedSearch, t]);

  const handleComplete = useCallback(async (id: string) => {
    try {
      await crmApi.activities.complete(id);
      qc.invalidateQueries({ queryKey: ["activities"] });
      setData(prev => prev.map(a => a.id === id ? { ...a, status: "COMPLETED" } : a));
    } catch (err) {
      console.error("Failed to complete activity:", err);
    }
  }, [qc]);

  const handleSaved = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["activities"] });
    const params: Record<string, unknown> = {
      limit: LIMIT,
      offset: 0,
    };
    if (statusFilter !== "ALL") {
      params.status = statusFilter;
    }
    crmApi.activities.list(params)
      .then(r => {
        const response = r as unknown as { data: AktiviteRow[]; total: number };
        const items = Array.isArray(response?.data) ? response.data : [];
        setData(items);
        setTotalCount(response?.total ?? 0);
        setPage(1);
      });
  }, [qc, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(totalCount / LIMIT));

  const now = new Date();
  const bekleyenSayisi = data.filter((a) => a.status === "PENDING").length;
  const tamamlananSayisi = data.filter((a) => a.status === "COMPLETED").length;
  const gecikmisSayisi = data.filter(
    (a) => a.status === "PENDING" && !!a.dueDate && new Date(a.dueDate) < now,
  ).length;

  const columns = buildAktiviteColumns(handleComplete, t);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
            <Activity size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t("activity.title")}</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {totalCount} {t("activity.recordsRegistered")}
            </p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)} className="h-9 gap-2 shadow-sm font-bold">
          <Plus size={16} />
          {t("activity.newActivity")}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryChip
          icon={Clock}
          label={t("activity.pendingCount")}
          value={bekleyenSayisi.toString()}
          variant="primary"
        />
        <SummaryChip
          icon={CheckCircle}
          label={t("activity.completedCount")}
          value={tamamlananSayisi.toString()}
          variant="primary"
        />
        <SummaryChip
          icon={AlertTriangle}
          label={t("activity.overdueCount")}
          value={gecikmisSayisi.toString()}
          variant={gecikmisSayisi > 0 ? "destructive" : "primary"}
        />
      </div>

      {gecikmisSayisi > 0 && (
        <Alert variant="destructive" className="flex items-center gap-3 h-12 shadow-sm">
          <AlertTitle className="hidden">Gecikmiş Aktivite Uyarısı</AlertTitle>
          <AlertTriangle size={15} className="shrink-0 mb-0.5" />
          <AlertDescription className="text-sm font-bold opacity-85 leading-none">
            {gecikmisSayisi} {t("activity.overdueWarning")}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <Input
            placeholder={t("activity.searchPlaceholder") || "Ara..."}
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 bg-muted/40"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] h-9 bg-muted/40">
            <SelectValue placeholder={t("common.all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("common.all")}</SelectItem>
            <SelectItem value="PENDING">{t("activity.statusLabel.PENDING")}</SelectItem>
            <SelectItem value="COMPLETED">{t("activity.statusLabel.COMPLETED")}</SelectItem>
            <SelectItem value="CANCELLED">{t("activity.statusLabel.CANCELLED")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
            <Loader2 size={13} className="animate-spin" />
            {t("activity.loading")}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-destructive text-[10px] font-bold uppercase tracking-widest">
            <AlertCircleIcon size={13} />
            {error}
          </div>
        )}
      </div>

      <Card className="shadow-sm border-none bg-card/50 overflow-hidden">
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={isLoading ? [] : data}
            showToolbar={false}
            showFooter={false}
            totalCount={totalCount}
            page={page}
            serverLimit={LIMIT}
          />
        </CardContent>
      </Card>

      {totalCount > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-4">
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {Math.min((page - 1) * LIMIT + 1, totalCount)}–{Math.min(page * LIMIT, totalCount)} {t("common.record")}
          </span>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                {page} / {pageCount}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page <= 1} onClick={() => setPage(1)}>
                  <ChevronsLeft size={16}/>
                </Button>
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16}/>
                </Button>
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={16}/>
                </Button>
                <Button variant="outline" size="icon" className="size-8 shadow-none" disabled={page >= pageCount} onClick={() => setPage(pageCount)}>
                  <ChevronsRight size={16}/>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateActivityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        t={t}
      />
    </div>
  );
}
