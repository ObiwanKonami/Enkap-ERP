'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, RefreshCw, BarChart2, TrendingUp,
  PieChart, Table2, Hash, AreaChart, LayoutDashboard, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart as RPieChart, Pie, Cell,
  AreaChart as RAreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { biApi, type Dashboard, type Widget, type ChartType, CHART_TYPE_LABELS } from '@/services/bi';
import { useI18n } from '@/hooks/use-i18n';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const CHART_ICONS: Record<ChartType, typeof BarChart2> = {
  bar:    BarChart2,
  line:   TrendingUp,
  pie:    PieChart,
  area:   AreaChart,
  table:  Table2,
  metric: Hash,
};

// Recharts requires actual color values — CSS class tokens cannot be used for SVG fill/stroke props
const CHART_COLORS  = ['#0EA5E9', '#38BDF8', '#7DD3FC', '#0369A1', '#075985', '#0284C7'];
const CHART_PRIMARY = '#0EA5E9';
const CHART_GRID    = 'rgba(0,0,0,0.06)';
const TICK_STYLE    = { fill: '#94a3b8', fontSize: 10 } as const;

// ─── WidgetChart ─────────────────────────────────────────────────────────────

function WidgetChart({ chartType, data, xField, yField }: {
  chartType: ChartType;
  data:      unknown[][];
  xField?:   string;
  yField?:   string;
}) {
  const parsed = data.map(row => ({
    x: String((row as unknown[])[0] ?? ''),
    y: Number((row as unknown[])[1] ?? 0),
  }));

  const fmtTooltip = (v: unknown) =>
    typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v ?? '');

  if (chartType === 'metric') {
    const total = parsed.reduce((sum, r) => sum + r.y, 0);
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-4xl font-bold tabular-nums text-foreground">
          {total.toLocaleString('tr-TR')}
        </p>
      </div>
    );
  }

  if (chartType === 'table') {
    return (
      <div className="overflow-auto h-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs py-1">{xField ?? 'Alan'}</TableHead>
              <TableHead className="text-xs py-1 text-right">{yField ?? 'Değer'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parsed.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="py-1 text-xs">{r.x}</TableCell>
                <TableCell className="py-1 text-xs text-right tabular-nums">
                  {r.y.toLocaleString('tr-TR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RPieChart>
          <Pie data={parsed} dataKey="y" nameKey="x" cx="50%" cy="50%" outerRadius={60} label>
            {parsed.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={fmtTooltip} />
          <Legend />
        </RPieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={parsed}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="x" tick={TICK_STYLE} />
          <YAxis tick={TICK_STYLE} tickFormatter={(v: unknown) => fmtTooltip(v)} />
          <Tooltip formatter={fmtTooltip} />
          <Area type="monotone" dataKey="y" stroke={CHART_PRIMARY} fill={`${CHART_PRIMARY}26`} />
        </RAreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={parsed}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="x" tick={TICK_STYLE} />
          <YAxis tick={TICK_STYLE} tickFormatter={(v: unknown) => fmtTooltip(v)} />
          <Tooltip formatter={fmtTooltip} />
          <Line type="monotone" dataKey="y" stroke={CHART_PRIMARY} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // bar (default)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={parsed}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis dataKey="x" tick={TICK_STYLE} />
        <YAxis tick={TICK_STYLE} tickFormatter={(v: unknown) => fmtTooltip(v)} />
        <Tooltip formatter={fmtTooltip} />
        <Bar dataKey="y" fill={CHART_PRIMARY} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────

function WidgetCard({ widget, dashboardId }: { widget: Widget; dashboardId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = CHART_ICONS[widget.chartType] ?? BarChart2;

  const { data: reportData } = useQuery({
    queryKey: ['bi-widget-data', widget.id],
    queryFn:  () => biApi.reports.execute(
      widget.reportDefinitionId,
      widget.parameters as Record<string, unknown> | undefined,
    ),
    staleTime:       widget.refreshMinutes * 60 * 1000,
    refetchInterval: widget.refreshMinutes * 60 * 1000,
  });

  const remove = useMutation({
    mutationFn: () => biApi.dashboards.deleteWidget(dashboardId, widget.id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['bi-dashboard', dashboardId] });
      setConfirmDelete(false);
    },
  });

  const rows = reportData?.rows ?? [];

  return (
    <>
      <Card className="shadow-sm flex flex-col min-h-[220px]">
        <CardContent className="p-4 flex flex-col flex-1 gap-3">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <Icon size={14} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{widget.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{CHART_TYPE_LABELS[widget.chartType]}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
          <div className="flex-1">
              {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-1.5 text-muted-foreground/40">
                <Icon size={22} />
                <span className="text-xs">{t("bi.widget.noData")}</span>
              </div>
            ) : (
              <WidgetChart
                chartType={widget.chartType}
                data={rows}
                xField={widget.xAxisField}
                yField={widget.yAxisField}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{t("bi.widget.removeTitle")}</DialogTitle>
            <DialogDescription>
              "{widget.title}" {t("bi.widget.removeSuffix")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              isLoading={remove.isPending}
            >
              {t("bi.widget.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── AddWidgetModal ───────────────────────────────────────────────────────────

function AddWidgetModal({ dashboardId, open, onClose }: {
  dashboardId: string;
  open:        boolean;
  onClose:     () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [title,          setTitle]          = useState('');
  const [reportId,       setReportId]       = useState('');
  const [chartType,      setChartType]      = useState<ChartType>('bar');
  const [xField,         setXField]         = useState('');
  const [yField,         setYField]         = useState('');
  const [refreshMinutes, setRefreshMinutes] = useState(30);

  const { data: reports } = useQuery({ queryKey: ['bi-reports'], queryFn: () => biApi.reports.list() });
  const reportList = Array.isArray(reports)
    ? reports
    : (reports as { data: { id: string; name: string }[] } | undefined)?.data ?? [];

  const add = useMutation({
    mutationFn: () => biApi.dashboards.addWidget(dashboardId, {
      reportDefinitionId: reportId,
      title,
      chartType,
      xAxisField:     xField || undefined,
      yAxisField:     yField || undefined,
      refreshMinutes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bi-dashboard', dashboardId] });
      onClose();
    },
  });

  const chartTypes: ChartType[] = ['bar', 'line', 'pie', 'area', 'table', 'metric'];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{t("bi.widget.add")}</DialogTitle>
          <DialogDescription>{t("bi.widget.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.widget.title")}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("bi.widget.titlePlaceholder")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.widget.selectReport")}</Label>
            <Select value={reportId} onValueChange={setReportId}>
              <SelectTrigger>
                <SelectValue placeholder={t("bi.widget.selectReportPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {reportList.map((r: { id: string; name: string }) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.widget.chartType")}</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {chartTypes.map(ct => {
                const Icon   = CHART_ICONS[ct];
                const active = chartType === ct;
                return (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setChartType(ct)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-2 rounded-md border text-xs cursor-pointer transition-colors',
                      active
                        ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                        : 'bg-transparent border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <Icon size={13} />{CHART_TYPE_LABELS[ct]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("bi.widget.xAxis")}</Label>
              <Input className="text-xs" value={xField} onChange={e => setXField(e.target.value)} placeholder={t("bi.widget.xAxisPlaceholder")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("bi.widget.yAxis")}</Label>
              <Input className="text-xs" value={yField} onChange={e => setYField(e.target.value)} placeholder={t("bi.widget.yAxisPlaceholder")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("bi.widget.refreshFrequency")}</Label>
            <Select value={String(refreshMinutes)} onValueChange={v => setRefreshMinutes(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">{t("bi.widget.minutes5")}</SelectItem>
                <SelectItem value="15">{t("bi.widget.minutes15")}</SelectItem>
                <SelectItem value="30">{t("bi.widget.minutes30")}</SelectItem>
                <SelectItem value="60">{t("bi.widget.hour1")}</SelectItem>
                <SelectItem value="360">{t("bi.widget.hours6")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => add.mutate()}
            disabled={!title || !reportId || add.isPending}
            isLoading={add.isPending}
          >
            {t("bi.widget.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function DashboardDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;
  const [showAddWidget, setShowAddWidget] = useState(false);

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['bi-dashboard', id],
    queryFn:  () => biApi.dashboards.get(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-12 flex flex-col items-center gap-3">
          <LayoutDashboard size={28} className="text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">{t("bi.detail.notFound")}</p>
          <Button variant="ghost" size="sm" onClick={() => router.back()}>{t("bi.detail.back")}</Button>
        </CardContent>
      </Card>
    );
  }

  const db      = dashboard.data as Dashboard;
  const widgets = db.widgets ?? [];

  return (
    <div className="flex flex-col gap-5">

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.back()}>
          <ArrowLeft size={13} /> {t("bi.detail.back")}
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <LayoutDashboard size={16} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{db.name}</h1>
          {db.isDefault && (
            <Badge variant="secondary" className="text-xs">{t("bi.detail.default")}</Badge>
          )}
        </div>
        <Button className="gap-1.5" onClick={() => setShowAddWidget(true)}>
          <Plus size={14} /> {t("bi.detail.addWidget")}
        </Button>
      </div>

      {/* Widget Grid */}
      {widgets.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="p-16 flex flex-col items-center gap-3">
            <LayoutDashboard size={32} className="text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">{t("bi.detail.empty")}</p>
            <p className="text-xs text-muted-foreground">
              {t("bi.detail.emptyDesc")}
            </p>
            <Button className="gap-1.5 mt-2" onClick={() => setShowAddWidget(true)}>
              <Plus size={14} /> {t("bi.detail.addFirstWidget")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-3.5">
          {widgets.map(widget => (
            <WidgetCard key={widget.id} widget={widget} dashboardId={id} />
          ))}
        </div>
      )}

      {widgets.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw size={11} /> {t("bi.detail.autoRefresh")}
        </p>
      )}

      <AddWidgetModal
        dashboardId={id}
        open={showAddWidget}
        onClose={() => setShowAddWidget(false)}
      />
    </div>
  );
}
