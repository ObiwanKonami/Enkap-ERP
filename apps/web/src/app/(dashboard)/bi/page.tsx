'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart2, Plus, Play, Share2, Trash2, Clock, LayoutDashboard,
  FileText, ExternalLink, CalendarClock, Mail, FileSpreadsheet, Loader2,
} from 'lucide-react';
import { biApi, ReportDefinition, Dashboard,
  CHART_TYPE_LABELS, DATA_SOURCE_LABELS,
  ChartType, DataSource, type ReportFormat,
} from '@/services/bi';
import { useI18n } from '@/hooks/use-i18n';
import { formatDate } from '@/lib/format';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const CHART_TYPE_OPTIONS: ChartType[] = ['bar', 'line', 'pie', 'area', 'table', 'metric'];
const DATA_SOURCE_OPTIONS: DataSource[] = ['financial', 'stock', 'hr', 'crm', 'purchase', 'order'];

// ─── Yeni Rapor Modal ─────────────────────────────────────────────────────────

function NewReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name,          setName         ] = useState('');
  const [description,   setDescription  ] = useState('');
  const [queryTemplate, setQueryTemplate] = useState(
    "SELECT\n  DATE_TRUNC('month', created_at) AS ay,\n  COUNT(*) AS adet\nFROM invoices\nWHERE tenant_id = :tenantId\nGROUP BY 1\nORDER BY 1;",
  );
  const [dataSource, setDataSource] = useState<DataSource>('financial');
  const [chartType,  setChartType ] = useState<ChartType>('bar');

  const create = useMutation({
    mutationFn: () => biApi.reports.create({
      name, description,
      query_template: queryTemplate,
      parameters: [],
      chart_type: chartType,
      data_source: dataSource,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bi-reports'] }); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t("bi.reportsTab.title")}</DialogTitle>
          <DialogDescription>{t("bi.reportsTab.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.reportsTab.reportName")}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("bi.reportsTab.reportNamePlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.reportsTab.descriptionLabel")}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t("bi.reportsTab.descriptionPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("bi.reportsTab.dataSource")}</Label>
              <Select value={dataSource} onValueChange={(v) => setDataSource(v as DataSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATA_SOURCE_OPTIONS.map(ds => (
                    <SelectItem key={ds} value={ds}>{DATA_SOURCE_LABELS[ds]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("bi.reportsTab.chartType")}</Label>
              <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHART_TYPE_OPTIONS.map(ct => (
                    <SelectItem key={ct} value={ct}>{CHART_TYPE_LABELS[ct]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.reportsTab.sqlTemplate")}</Label>
            <Textarea
              className="text-xs resize-y"
              rows={8}
              value={queryTemplate}
              onChange={e => setQueryTemplate(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{t("bi.reportsTab.sqlHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name || !queryTemplate || create.isPending}
            isLoading={create.isPending}
          >
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rapor Çalıştır Modal ─────────────────────────────────────────────────────

function ExecuteModal({ report, onClose }: { report: ReportDefinition; onClose: () => void }) {
  const { t } = useI18n();
  const [result,  setResult ] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try { setResult(await biApi.reports.execute(report.id)); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[900px] flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{report.name}</DialogTitle>
          <DialogDescription>{t("bi.reportsTab.runToSee")}</DialogDescription>
        </DialogHeader>
        <Button
          size="sm"
          className="self-start gap-1.5"
          onClick={run}
          disabled={loading}
          isLoading={loading}
        >
          {!loading && <Play size={13} />}
          {loading ? t("bi.reportsTab.running") : t("bi.reportsTab.execute")}
        </Button>
        {result ? (
          <div className="overflow-auto flex-1 border border-border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {result.columns.map(col => (
                    <TableHead key={col} className="text-xs font-semibold uppercase tracking-wider py-3">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={result.columns.length} className="h-24 text-center text-xs text-muted-foreground">
                      {t("bi.reportsTab.noResult")}
                    </TableCell>
                  </TableRow>
                ) : (
                  result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {(row as unknown[]).map((cell, j) => (
                        <TableCell key={j} className="text-xs">{String(cell ?? '—')}</TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground py-12">
            <Play size={28} className="opacity-30" />
            <span className="text-sm">{t("bi.reportsTab.runToSee")}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Yeni Dashboard Modal ─────────────────────────────────────────────────────

function NewDashboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name,        setName       ] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault,   setIsDefault  ] = useState(false);

  const create = useMutation({
    mutationFn: () => biApi.dashboards.create({ name, description, isDefault }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bi-dashboards'] }); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t("bi.dashboardTab.title")}</DialogTitle>
          <DialogDescription>{t("bi.dashboardTab.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.dashboardTab.dashboardName")}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("bi.dashboardTab.dashboardNamePlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.dashboardTab.descriptionLabel")}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t("bi.dashboardTab.descriptionPlaceholder")} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="rounded"
            />
            {t("bi.dashboardTab.setAsDefault")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!name || create.isPending}
            isLoading={create.isPending}
          >
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rapor Zamanlama Modal ────────────────────────────────────────────────────

function ScheduleModal({ report, onClose }: { report: ReportDefinition; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const CRON_PRESETS = [
    { label: t("bi.schedule.dailyMorning"),        value: '0 9 * * *'  },
    { label: t("bi.schedule.weeklyMonday"),        value: '0 9 * * 1'  },
    { label: t("bi.schedule.weeklyFriday"),        value: '0 17 * * 5' },
    { label: t("bi.schedule.monthlyFirst"),        value: '0 9 1 * *'  },
    { label: t("bi.schedule.custom"),             value: 'custom'      },
  ];

  const initialPreset = report.cronSchedule
    ? (CRON_PRESETS.find(p => p.value === report.cronSchedule) ? report.cronSchedule : 'custom')
    : CRON_PRESETS[0].value;

  const [preset,     setPreset    ] = useState(initialPreset);
  const [customCron, setCustomCron] = useState(
    report.cronSchedule && !CRON_PRESETS.find(p => p.value === report.cronSchedule)
      ? report.cronSchedule
      : '',
  );
  const [email,  setEmail ] = useState(report.scheduleEmail  ?? '');
  const [format, setFormat] = useState<ReportFormat>(report.scheduleFormat ?? 'pdf');

  const isCustom      = preset === 'custom';
  const effectiveCron = isCustom ? customCron : preset;

  const saveMut = useMutation({
    mutationFn: () => biApi.reports.schedule(report.id, { cronSchedule: effectiveCron, email, format }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bi-reports'] }); onClose(); },
  });

  const deleteMut = useMutation({
    mutationFn: () => biApi.reports.deleteSchedule(report.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bi-reports'] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2">
            <CalendarClock size={15} className="text-primary" />
          </div>
          <DialogTitle>{t("bi.schedule.title")}</DialogTitle>
          <DialogDescription>{report.name}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Gönderim Sıklığı */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("bi.schedule.frequency")}
            </p>
            <div className="flex flex-col gap-1.5">
              {CRON_PRESETS.map(p => {
                const active = preset === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => setPreset(p.value)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-lg text-sm border cursor-pointer transition-colors',
                      active
                        ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                        : 'bg-muted/30 border-border text-foreground hover:bg-muted/50',
                    )}
                  >
                    <span>{p.label}</span>
                    {p.value !== 'custom' && (
                      <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {p.value}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {isCustom && (
              <div className="flex flex-col gap-1.5 mt-1">
                <Label className="text-xs text-muted-foreground">
                  {t("bi.schedule.cronExpression")}
                </Label>
                <Input
                  className=""
                  value={customCron}
                  onChange={e => setCustomCron(e.target.value)}
                  placeholder="0 9 * * 1"
                />
              </div>
            )}
          </div>

          {/* E-posta */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("bi.schedule.emailLabel")}
            </p>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                className="pl-8"
                placeholder={t("bi.schedule.emailPlaceholder")}
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Format */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("bi.schedule.format")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('pdf')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border cursor-pointer transition-colors',
                  format === 'pdf'
                    ? 'bg-destructive/10 border-destructive/30 text-destructive font-medium'
                    : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                <FileText size={14} /> PDF
              </button>
              <button
                onClick={() => setFormat('excel')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border cursor-pointer transition-colors',
                  format === 'excel'
                    ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {report.cronSchedule && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMut.mutate()}
                  disabled={deleteMut.isPending}
                  isLoading={deleteMut.isPending}
                >
                  {!deleteMut.isPending && <Trash2 size={12} />}
                  {t("bi.schedule.deleteSchedule")}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !email || (isCustom && !effectiveCron)}
                isLoading={saveMut.isPending}
                className="gap-1.5"
              >
                {!saveMut.isPending && <CalendarClock size={13} />}
                {t("bi.schedule.scheduleButton")}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Raporlar Sekmesi ─────────────────────────────────────────────────────────

function ReportsTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showNew,    setShowNew   ] = useState(false);
  const [executing,  setExecuting ] = useState<ReportDefinition | null>(null);
  const [scheduling, setScheduling] = useState<ReportDefinition | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bi-reports'],
    queryFn: () => biApi.reports.list(),
  });

  const share = useMutation({
    mutationFn: (id: string) => biApi.reports.share(id),
    onSuccess: (result) => {
      navigator.clipboard?.writeText(result.data.url ?? '');
      alert(`${t("bi.reportsList.shareSuccess")}\n${result.data.url}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => biApi.reports.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi-reports'] }),
  });

  const reports = Array.isArray(data) ? data : (data as { data: ReportDefinition[] } | undefined)?.data ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={22} className="animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">{reports.length} {t("bi.reportCount")}</span>
        <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
          <Plus size={14} /> {t("bi.newReport")}
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card className="shadow-sm border-dashed">
          <CardContent className="p-12 flex flex-col items-center gap-3">
            <FileText size={28} className="text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground">{t("bi.noReports")}</p>
            <p className="text-xs text-muted-foreground">{t("bi.noReportsDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map(report => (
            <Card key={report.id} className="shadow-sm hover:bg-muted/20 transition-colors">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{report.name}</p>
                  {report.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {report.cronSchedule && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                        <Clock size={11} />{report.cronSchedule}
                      </span>
                    )}
                    {report.shareToken && (
                      <Badge variant="secondary" className="text-[10px] h-4">{t("bi.reportsList.shared")}</Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">{formatDate(report.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setExecuting(report)}>
                    <Play size={11} /> {t("bi.reportsList.run")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-7 text-xs gap-1', report.cronSchedule && 'text-primary border-primary/30')}
                    onClick={() => setScheduling(report)}
                  >
                    <CalendarClock size={11} />
                    {report.cronSchedule ? t("bi.reportsList.scheduleActive") : t("bi.reportsList.schedule")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => share.mutate(report.id)}
                  >
                    <Share2 size={11} /> {t("bi.reportsList.share")}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(t("bi.reportsList.confirmDelete"))) {
                        remove.mutate(report.id);
                      }
                    }}
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewReportModal  open={showNew}    onClose={() => setShowNew(false)} />
      {executing  && <ExecuteModal  report={executing}  onClose={() => setExecuting(null)} />}
      {scheduling && <ScheduleModal report={scheduling} onClose={() => setScheduling(null)} />}
    </>
  );
}

// ─── Dashboard'lar Sekmesi ────────────────────────────────────────────────────

function DashboardsTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['bi-dashboards'],
    queryFn: () => biApi.dashboards.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => biApi.dashboards.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bi-dashboards'] }),
  });

  const dashboards = Array.isArray(data) ? data : (data as { data: Dashboard[] } | undefined)?.data ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={22} className="animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">{dashboards.length} {t("bi.dashboardCount")}</span>
        <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
          <Plus size={14} /> {t("bi.newDashboard")}
        </Button>
      </div>

      {dashboards.length === 0 ? (
        <Card className="shadow-sm border-dashed">
          <CardContent className="p-12 flex flex-col items-center gap-3">
            <LayoutDashboard size={28} className="text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground">{t("bi.noDashboards")}</p>
            <p className="text-xs text-muted-foreground">{t("bi.noDashboardsDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map(db => (
            <Card key={db.id} className="shadow-sm">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                    <LayoutDashboard size={16} className="text-primary" />
                  </div>
                  {db.isDefault && (
                    <Badge variant="secondary" className="text-[10px]">{t("bi.detail.default")}</Badge>
                  )}
                </div>
                <div>
                  <Link
                    href={`/bi/${db.id}`}
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                  >
                    {db.name}
                  </Link>
                  {db.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{db.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {db.widgets?.length ?? db.layout.length} {t("bi.widgetCount")}
                  </span>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                      <Link href={`/bi/${db.id}`}>
                        <ExternalLink size={11} /> {t("bi.detail.addWidget")}
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(t("bi.reportsList.confirmDelete"))) {
                          remove.mutate(db.id);
                        }
                      }}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewDashboardModal open={showNew} onClose={() => setShowNew(false)} />
    </>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function BiPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <BarChart2 size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("bi.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("bi.subtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileText size={13} /> {t("bi.reports")}
          </TabsTrigger>
          <TabsTrigger value="dashboards" className="gap-1.5">
            <LayoutDashboard size={13} /> {t("bi.dashboards")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-4">
          <ReportsTab />
        </TabsContent>
        <TabsContent value="dashboards" className="mt-4">
          <DashboardsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
