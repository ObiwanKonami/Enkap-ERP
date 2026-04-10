"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import type { Lead, LeadStage, Contact } from "@/services/crm";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import {
  Plus,
  TrendingUp,
  Briefcase,
  X,
  Search,
  Save,
  AlertCircle,
  Loader2,
  Pencil,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Stage Konfigürasyonu ───────────────────────────────────────────────────

function getStages(t: (key: string) => string): StageConfig[] {
  return [
    {
      key: "NEW",
      label: t("pipeline.stages.NEW"),
      cls: "text-muted-foreground border-border bg-muted/50",
      dot: "bg-muted-foreground",
      badge: "bg-muted text-muted-foreground",
    },
    {
      key: "CONTACTED",
      label: t("pipeline.stages.CONTACTED"),
      cls: "text-primary border-primary/20 bg-primary/10",
      dot: "bg-primary",
      badge: "bg-primary/10 text-primary",
    },
    {
      key: "QUALIFIED",
      label: t("pipeline.stages.QUALIFIED"),
      cls: "text-primary border-primary/20 bg-primary/10",
      dot: "bg-primary",
      badge: "bg-primary/10 text-primary",
    },
    {
      key: "PROPOSAL",
      label: t("pipeline.stages.PROPOSAL"),
      cls: "text-primary border-primary/20 bg-primary/10",
      dot: "bg-primary",
      badge: "bg-primary/10 text-primary",
    },
    {
      key: "NEGOTIATION",
      label: t("pipeline.stages.NEGOTIATION"),
      cls: "text-primary border-primary/20 bg-primary/10",
      dot: "bg-primary",
      badge: "bg-primary/10 text-primary",
    },
    {
      key: "WON",
      label: t("pipeline.stages.WON"),
      cls: "text-primary border-primary/20 bg-primary/10",
      dot: "bg-primary",
      badge: "bg-primary/10 text-primary",
    },
    {
      key: "LOST",
      label: t("pipeline.stages.LOST"),
      cls: "text-destructive border-destructive/20 bg-destructive/10",
      dot: "bg-destructive",
      badge: "bg-destructive/10 text-destructive",
    },
  ];
}

interface StageConfig {
  key: LeadStage;
  label: string;
  cls: string;
  dot: string;
  badge: string;
}

// ─── İletişim Arama Girişi ──────────────────────────────────────────────────

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
  const ref = useRef<HTMLDivElement>(null);

  const { data: contacts } = useQuery({
    queryKey: ["contacts-search", q],
    queryFn: () =>
      crmApi.contacts.list({ q, limit: 8 }).then((r) => r.data.data ?? r.data),
    enabled: q.length >= 1,
    staleTime: 10_000,
  });

  const items: Contact[] = Array.isArray(contacts) ? contacts : [];

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
          className="pl-9 h-9 bg-muted/40 text-sm focus-visible:ring-sky-500/30"
          placeholder={t("pipeline.leadModal.contactSearchPlaceholder")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && items.length > 0 && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 shadow-xl border-primary/20 max-h-48 overflow-y-auto">
          <CardContent className="p-1">
            {items.map((c) => (
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
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Kurumsal Fırsat Modal (Dialog) ──────────────────────────────────────────

interface LeadModalProps {
  lead?: Lead;
  initialStage?: LeadStage;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
  stages: StageConfig[];
}

function LeadModal({
  lead,
  initialStage,
  open,
  onClose,
  onSaved,
  t,
  stages,
}: LeadModalProps) {
  const isEdit = !!lead;

  const [title, setTitle] = useState(lead?.title ?? "");
  const [contact, setContact] = useState<{ id: string; name: string } | null>(
    lead ? { id: lead.contactId, name: lead.contactName } : null,
  );
  const [stage, setStage] = useState<LeadStage>(
    lead?.stage ?? initialStage ?? "NEW",
  );
  const [valueTl, setValueTl] = useState(lead ? String(lead.value) : "");
  const [closeDate, setCloseDate] = useState(
    lead?.closeDate?.slice(0, 10) ?? "",
  );
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [formError, setFormError] = useState("");

  const canSubmit = title.trim().length >= 2 && contact !== null;

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        contactId: contact!.id,
        contactName: contact!.name,
        stage,
        value: valueTl ? parseFloat(valueTl) : 0,
        currency: "TRY",
        closeDate: closeDate || undefined,
        notes: notes || undefined,
      };
      return isEdit
        ? crmApi.leads.update(lead!.id, payload)
        : crmApi.leads.create(payload);
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: () => setFormError(t("pipeline.leadModal.errorOccurred")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden shadow-2xl border-primary/20">
        <DialogHeader className="px-6 py-4 bg-muted/50 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2.5 text-lg font-bold">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <TrendingUp size={16} className="text-primary" />
            </div>
            {isEdit
              ? t("pipeline.leadModal.editLead")
              : t("pipeline.leadModal.newLead")}
          </DialogTitle>
        </DialogHeader>

        <CardContent className="px-6 py-5 flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("pipeline.leadModal.opportunityTitle")}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              className="h-9 bg-muted/40 text-sm focus-visible:ring-sky-500/30 font-medium"
              placeholder={t("pipeline.leadModal.opportunityTitlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              {t("pipeline.leadModal.contactSearch")}
              <span className="text-destructive">*</span>
            </Label>
            <ContactSearchInput value={contact} onChange={setContact} t={t} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pipeline.leadModal.stage")}
              </Label>
              <Select value={stage} onValueChange={(v) => setStage(v as LeadStage)}>
                <SelectTrigger className="h-9 bg-muted/40 text-sm shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pipeline.leadModal.expectedValue")}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">₺</span>
                <Input
                  className="pl-7 h-9 bg-muted/40 text-sm tracking-tight tabular-nums shadow-none"
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="0"
                  value={valueTl}
                  onChange={(e) => setValueTl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("pipeline.leadModal.closeDate")}
            </Label>
            <DateInput
              className="h-9 bg-muted/40 text-sm shadow-none"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("pipeline.leadModal.notes")}
            </Label>
            <Textarea
              className="bg-muted/40 text-sm shadow-none min-h-[80px] focus-visible:ring-sky-500/30"
              placeholder={t("pipeline.leadModal.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {formError && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle size={14} />
              <AlertDescription className="text-xs font-medium">
                {formError}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <DialogFooter className="px-6 py-4 bg-muted/50 border-t border-border/50 gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("pipeline.leadModal.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => mutate()}
            disabled={isPending || !canSubmit}
            className="min-w-[120px] gap-2 shadow-sm"
          >
            {isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                {t("pipeline.leadModal.saving")}
              </>
            ) : (
              <>
                <Save size={13} />
                {isEdit ? t("common.update") : t("pipeline.leadModal.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead Kartı (Draggable) ─────────────────────────────────────────────────

function LeadCard({
  lead,
  onEdit,
  t,
}: {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  t: (key: string) => string;
}) {
  const [dragging, setDragging] = useState(false);

  const now = new Date();
  const closeDate = lead.closeDate ? new Date(lead.closeDate) : null;
  const isOverdue =
    closeDate &&
    closeDate < now &&
    !["WON", "LOST"].includes(lead.stage);

  const getValueCls = (v: number) => {
    if (v >= 1_000_000) return "text-primary";
    if (v >= 300_000) return "text-primary";
    return "text-muted-foreground";
  };

  return (
    <Card
      className={cn(
        "group cursor-grab shadow-sm border-border/50 hover:border-primary/50 hover:shadow-md transition-all active:cursor-grabbing",
        dragging ? "opacity-40 grayscale-[0.2]" : "opacity-100"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onEdit(lead)}
    >
      <CardContent className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-foreground leading-snug line-clamp-2 flex-1 group-hover:text-primary transition-colors">
            {lead.title}
          </p>
          <div className="flex flex-col items-end shrink-0">
            <span className={cn("text-xs font-bold tracking-tight", getValueCls(lead.value))}>
              {formatCurrency(lead.value)}
            </span>
            <Pencil size={11} className="text-muted-foreground/40 mt-1 invisible group-hover:visible" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/80">
          <div className="size-5 rounded bg-muted flex items-center justify-center shrink-0">
            <Briefcase size={11} className="text-muted-foreground" />
          </div>
          <span className="truncate">{lead.contactName}</span>
        </div>

        {closeDate && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Clock size={11} className={cn("shrink-0", isOverdue ? "text-destructive" : "text-muted-foreground/60")} />
            <span className={cn("text-[10px] font-bold tracking-tighter tabular-nums", 
              isOverdue ? "text-destructive" : "text-muted-foreground/60")}>
              {isOverdue && <span className="mr-1">{t("pipeline.overdue")}</span>}
              {closeDate.toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Kanban Sütunu (Droppable) ───────────────────────────────────────────────

function KanbanColumn({
  config,
  leads,
  onAddLead,
  onEdit,
  onDrop,
  t,
}: {
  config: StageConfig;
  leads: Lead[];
  onAddLead: (stage: LeadStage) => void;
  onEdit: (lead: Lead) => void;
  onDrop: (leadId: string, stage: LeadStage) => void;
  t: (key: string) => string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const totalValue = leads.reduce((sum, l) => sum + l.value, 0);

  return (
    <div className="flex flex-col w-[300px] shrink-0 h-full group/column">
      {/* Sütun Başlığı */}
      <div className={cn(
        "flex items-center justify-between px-3.5 py-3 rounded-t-xl border border-b-0 shadow-sm",
        config.cls
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn("size-2 rounded-full", config.dot)} />
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em]">
            {config.label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
           <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] shadow-none border-transparent", config.badge)}>
            {leads.length}
          </Badge>
          <Button 
            variant="ghost" size="icon" className="size-6 text-current/60 hover:text-current hover:bg-current/10"
            onClick={() => onAddLead(config.key)}
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>

      {/* Sütun Parasal Özeti */}
      <div className={cn("px-4 py-1.5 border-x border-b shadow-sm", config.cls)}>
        <p className="text-[10px] font-bold tracking-tight opacity-70">
          {formatCurrency(totalValue)}
        </p>
      </div>

      {/* Sütun İçeriği (Drop Zone) */}
      <div
        className={cn(
          "flex-1 overflow-y-auto space-y-3 p-3 border-x border-b rounded-b-xl transition-all grow",
          config.cls,
          isDragOver ? "bg-primary/10 shadow-[inner_0_0_12px_rgba(14,165,233,0.3)] ring-2 ring-primary/30 ring-inset" : "bg-card/30"
        )}
        style={{ scrollbarWidth: "none" }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const leadId = e.dataTransfer.getData("text/plain");
          if (leadId) onDrop(leadId, config.key);
        }}
      >
        {leads.length === 0 ? (
          <div className="h-24 flex flex-col items-center justify-center border-2 border-dashed border-border/40 rounded-lg p-4 text-center opacity-30">
            <TrendingUp size={16} className="mb-2" />
            <p className="text-[10px] font-medium uppercase tracking-widest">{t("pipeline.noLeads")}</p>
          </div>
        ) : (
          leads.map((l) => (
            <LeadCard key={l.id} lead={l} onEdit={onEdit} t={t} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const stages = getStages(t);

  const [search, setSearch] = useState("");
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [initialStage, setInitialStage] = useState<LeadStage | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["crm-leads", search],
    queryFn: () => crmApi.leads.list({ limit: 1000 }).then((r) => r.data),
  });

  const leads = leadsData?.data ?? [];
  const filteredLeads = search
    ? leads.filter((l) =>
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        l.contactName.toLowerCase().includes(search.toLowerCase())
      )
    : leads;

  const moveLeadMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) =>
      crmApi.leads.update(id, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads"] }),
  });

  const handleDrop = useCallback(
    (leadId: string, stage: LeadStage) => {
      const lead = leads.find((l) => l.id === leadId);
      if (lead && lead.stage !== stage) {
        moveLeadMutation.mutate({ id: leadId, stage });
      }
    },
    [leads, moveLeadMutation],
  );

  const totalValue = leads.reduce((sum, l) => sum + l.value, 0);
  const openLeads = leads.filter((l) => !["WON", "LOST"].includes(l.stage)).length;

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-140px)]">
      {/* Üst Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <TrendingUp size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t("pipeline.title")}</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{leads.length} {t("pipeline.opportunities")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 bg-muted/40 border-border/50 shadow-none text-sm"
              placeholder={t("pipeline.searchInBoard")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setIsNewOpen(true)} className="h-9 gap-2 shadow-sm font-bold">
            <Plus size={16} /> {t("pipeline.newOpportunity")}
          </Button>
        </div>
      </div>

      {/* KPI Şeridi */}
      <div className="flex gap-4">
        <Card className="flex-1 shadow-sm border-none bg-card/60 backdrop-blur-sm">
          <CardContent className="py-3.5 px-5">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-primary" />
              </div>
              <div className="flex flex-col">
                 <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("pipeline.expectedValue")}</span>
                 <span className="text-xl font-black tracking-tight text-primary">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 shadow-sm border-none bg-card/60 backdrop-blur-sm">
          <CardContent className="py-3.5 px-5">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase size={18} className="text-primary" />
              </div>
              <div className="flex flex-col">
                 <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t("pipeline.activeSales")}</span>
                 <span className="text-xl font-black tracking-tight text-primary tabular-nums">{openLeads}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Bord */}
      <div className="flex-1 overflow-auto bg-muted/20 rounded-2xl border border-border/40 p-4 min-h-0">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground">
             <Loader2 className="animate-spin" size={32} />
             <p className="text-sm font-black uppercase tracking-widest">{t("common.loading")}</p>
          </div>
        ) : (
          <div className="flex gap-4 h-full pb-2">
            {stages.map((s) => (
              <KanbanColumn
                key={s.key}
                config={s}
                leads={filteredLeads.filter((l) => l.stage === s.key)}
                onAddLead={(st) => {
                  setInitialStage(st);
                  setIsNewOpen(true);
                }}
                onEdit={setEditLead}
                onDrop={handleDrop}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modallar */}
      {(isNewOpen || editLead) && (
        <LeadModal
          open={!!(isNewOpen || editLead)}
          lead={editLead ?? undefined}
          initialStage={initialStage ?? undefined}
          stages={stages}
          onClose={() => {
            setIsNewOpen(false);
            setEditLead(null);
            setInitialStage(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["crm-leads"] })}
          t={t}
        />
      )}
    </div>
  );
}
