"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/hooks/use-i18n";
import Link from "next/link";
import {
  Truck, Users, Route, AlertTriangle, RefreshCw, CheckCircle,
  Plus, ChevronRight, MapPin, CreditCard, Check, X, AlertCircle,
} from "lucide-react";
import {
  fleetApi,
  type Vehicle, type Driver, type Trip, type HgsRecord,
  VEHICLE_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_STATUS_CLS,
  DRIVER_STATUS_LABELS, TRIP_STATUS_LABELS, TRIP_STATUS_CLS,
} from "@/services/fleet";
import { formatCurrency, formatDate, kurusToTl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

const HGS_VEHICLE_ALL = "__ALL_VEHICLES__";
const HGS_VEHICLE_NONE = "__NONE__";

function KpiCard({
  label, value, sub, accentCls, iconCls, icon: Icon,
}: {
  label: string; value: string; sub?: string;
  accentCls: string; iconCls: string; icon: React.ElementType;
}) {
  return (
    <Card className="shadow-sm flex-1 min-w-[160px]">
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", accentCls)}>
          <Icon size={18} className={iconCls} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function NewHgsModal({
  vehicles, open, onClose, onSuccess,
}: {
  vehicles: Vehicle[]; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState(HGS_VEHICLE_NONE);
  const [form, setForm] = useState({
    transactionDate: new Date().toISOString().slice(0, 16),
    amountKurus: "", deviceType: "HGS" as "HGS" | "OGS",
    location: "", direction: "", balanceKurus: "", deviceId: "", note: "",
  });
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () =>
      fleetApi.hgs.create(vehicleId === HGS_VEHICLE_NONE ? "" : vehicleId, {
        transactionDate: new Date(form.transactionDate).toISOString(),
        amountKurus: Math.round(parseFloat(form.amountKurus) * 100),
        deviceType: form.deviceType,
        location: form.location || undefined,
        direction: form.direction || undefined,
        balanceKurus: form.balanceKurus ? Math.round(parseFloat(form.balanceKurus) * 100) : undefined,
        deviceId: form.deviceId || undefined,
        note: form.note || undefined,
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["fleet-hgs"] }); onSuccess(); onClose(); },
  });

  const valid = vehicleId !== HGS_VEHICLE_NONE && form.amountKurus && parseFloat(form.amountKurus) >= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard size={15} className="text-amber-500" />
            {t("fleet.hgsModal.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.selectVehicle")} *</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t("fleet.hgsModal.selectVehicle")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={HGS_VEHICLE_NONE}>{t("fleet.hgsModal.selectVehicle")}</SelectItem>
                {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.passageDate")} *</Label>
            <Input type="datetime-local" className="h-9" value={form.transactionDate} onChange={f("transactionDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.deviceType")} *</Label>
            <Select value={form.deviceType} onValueChange={(v) => setForm((p) => ({ ...p, deviceType: v as "HGS" | "OGS" }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HGS">HGS</SelectItem>
                <SelectItem value="OGS">OGS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.passageFee")} *</Label>
            <Input type="number" className="h-9 tabular-nums" placeholder="185.00" min={0} step={0.01} value={form.amountKurus} onChange={f("amountKurus")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.remainingBalance")}</Label>
            <Input type="number" className="h-9 tabular-nums" placeholder="2450.00" min={0} step={0.01} value={form.balanceKurus} onChange={f("balanceKurus")} />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.passagePoint")}</Label>
            <Input className="h-9" placeholder="Osmangazi Köprüsü, FSM Köprüsü…" value={form.location} onChange={f("location")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.direction")}</Label>
            <Input className="h-9" placeholder={t("fleet.hgsModal.directionPlaceholder")} value={form.direction} onChange={f("direction")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.deviceNo")}</Label>
            <Input className="h-9 tabular-nums" placeholder="00123456789" value={form.deviceId} onChange={f("deviceId")} />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("fleet.hgsModal.note")}</Label>
            <Input className="h-9" placeholder={t("fleet.hgsModal.notePlaceholder")} value={form.note} onChange={f("note")} />
          </div>
        </div>

        {mutation.error && (
          <Alert variant="destructive">
            <AlertCircle size={13} />
            <AlertDescription>{t("fleet.hgsModal.passageFailed")}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} isLoading={mutation.isPending}>
            {t("fleet.hgsModal.addPassage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({
  icon: Icon, iconCls, title, linkHref, linkLabel,
}: {
  icon: React.ElementType; iconCls: string; title: string; linkHref: string; linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon size={14} className={iconCls} /> {title}
      </span>
      <Link href={linkHref} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors">
        {linkLabel} <ChevronRight size={11} />
      </Link>
    </div>
  );
}

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm",
      type === "success"
        ? "bg-primary/10 border-primary/30 text-primary"
        : "bg-destructive/10 border-destructive/30 text-destructive"
    )}>
      {type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 hover:opacity-70">
        <X size={13} />
      </button>
    </div>
  );
}

export default function FiloPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [showHgsModal, setShowHgsModal] = useState(false);
  const [hgsVehicleFilter, setHgsVehicleFilter] = useState(HGS_VEHICLE_ALL);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const { data: vehiclesData, isLoading: vLoading, refetch: refetchV } = useQuery({
    queryKey: ["fleet-vehicles"],
    queryFn: () => fleetApi.vehicles.list({ limit: 200 }).then((r) => r.data),
  });
  const { data: driversData, isLoading: dLoading, refetch: refetchD } = useQuery({
    queryKey: ["fleet-drivers"],
    queryFn: () => fleetApi.drivers.list({ limit: 200 }).then((r) => r.data),
  });
  const { data: tripsData, isLoading: tLoading, refetch: refetchT } = useQuery({
    queryKey: ["fleet-trips"],
    queryFn: () => fleetApi.trips.list({ limit: 50 }).then((r) => r.data),
  });
  const { data: hgsSummaryData } = useQuery({
    queryKey: ["fleet-hgs", "summary"],
    queryFn: () => fleetApi.hgs.getSummary().then((r) => r.data),
  });
  const { data: hgsListData } = useQuery({
    queryKey: ["fleet-hgs", "list", hgsVehicleFilter],
    queryFn: () =>
      fleetApi.hgs.listAll({ vehicleId: hgsVehicleFilter !== HGS_VEHICLE_ALL ? hgsVehicleFilter : undefined, limit: 10 })
        .then((r) => r.data),
  });

  const vehicles: Vehicle[] = vehiclesData?.data ?? [];
  const drivers: Driver[] = driversData?.data ?? [];
  const trips: Trip[] = tripsData?.data ?? [];

  const busyVehicleIds = new Set(trips.filter((t) => ["YOLDA","PLANLANMIS"].includes(t.status)).map((t) => t.vehicleId));
  const busyDriverIds = new Set(trips.filter((t) => ["YOLDA","PLANLANMIS"].includes(t.status)).map((t) => t.driverId));

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };
  const refetchAll = () => { void refetchV(); void refetchD(); void refetchT(); void qc.invalidateQueries({ queryKey: ["fleet-hgs"] }); };

  const activeVehicles = vehicles.filter((v) => v.status === "AKTIF").length;
  const activeDrivers = drivers.filter((d) => d.status === "AKTIF").length;
  const activeTrips = trips.filter((t) => t.status === "YOLDA").length;

  const alerts = vehicles.flatMap((v) => {
    const items: { plate: string; label: string; days: number }[] = [];
    const check = (d: string | undefined, label: string) => {
      const days = daysUntil(d);
      if (days !== null && days >= 0 && days <= 30) items.push({ plate: v.plate, label, days });
    };
    check(v.inspectionExpires, t("fleet.inspection"));
    check(v.insuranceExpires, t("fleet.kasko"));
    check(v.registrationExpires, t("fleet.registration"));
    check(v.trafficInsuranceExpires, t("fleet.trafficInsurance"));
    return items;
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => fleetApi.trips.start(id),
    onSuccess: () => { showToast(t("fleet.seferler.tripStarted"), "success"); void refetchT(); },
  });
  const completeMutation = useMutation({
    mutationFn: ({ id, endKm }: { id: string; endKm: number }) => fleetApi.trips.complete(id, endKm),
    onSuccess: () => { showToast(t("fleet.seferler.tripCompleted"), "success"); void refetchT(); },
  });

  const isLoading = vLoading || dLoading || tLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck size={20} className="text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("fleet.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={refetchAll}>
            <RefreshCw size={13} /> {t("fleet.refresh")}
          </Button>
          <Button variant="ghost" size="sm" asChild className="h-9 gap-2 text-primary hover:text-primary/80 hover:bg-primary/10">
            <Link href="/filo/seferler/yeni"><Route size={13} /> {t("fleet.newTrip")}</Link>
          </Button>
          <Button asChild className="h-9 gap-2 shadow-sm">
            <Link href="/filo/araclar/yeni"><Plus size={13} /> {t("fleet.newVehicle")}</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <KpiCard icon={Truck} label={t("fleet.totalVehicles")} value={String(vehicles.length)} sub={`${activeVehicles} ${t("fleet.active")}`} accentCls="bg-primary/10" iconCls="text-primary" />
        <KpiCard icon={Users} label={t("fleet.totalDrivers")} value={String(drivers.length)} sub={`${activeDrivers} ${t("fleet.active")}`} accentCls="bg-primary/10" iconCls="text-primary" />
        <KpiCard icon={Route} label={t("fleet.activeTrips")} value={String(activeTrips)} sub={t("fleet.onTrip")} accentCls="bg-primary/10" iconCls="text-primary" />
        <KpiCard icon={AlertTriangle} label={t("fleet.upcomingAlerts")} value={String(alerts.length)} sub={t("fleet.within30Days")} accentCls={alerts.length > 0 ? "bg-amber-500/10" : "bg-primary/10"} iconCls={alerts.length > 0 ? "text-amber-500" : "text-primary"} />
        <KpiCard icon={CreditCard} label={t("fleet.hgsTotal")} value={formatCurrency(kurusToTl(hgsSummaryData?.totalAmountKurus ?? 0))} sub={`${hgsSummaryData?.transactionCount ?? 0} ${t("fleet.transactions")}`} accentCls="bg-amber-500/10" iconCls="text-amber-500" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <span className="inline-block animate-spin">⟳</span>
          {t("common.loading")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm overflow-hidden">
              <SectionHeader icon={Truck} iconCls="text-primary" title={t("fleet.vehicles")} linkHref="/filo/araclar" linkLabel={t("fleet.all")} />
              {vehicles.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">{t("fleet.noVehicles")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs uppercase tracking-wider font-semibold">{t("fleet.plateModel")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-center">{t("common.status")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-center">{t("fleet.gps")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.slice(0, 7).map((v) => {
                      const inspDays = daysUntil(v.inspectionExpires);
                      const expiring = inspDays !== null && inspDays >= 0 && inspDays <= 30;
                      const isBusy = busyVehicleIds.has(v.id);
                      return (
                        <TableRow key={v.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Truck size={14} className="text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-foreground">{v.plate}</p>
                                <p className="text-[11px] text-muted-foreground">{v.brand} {v.model} · {VEHICLE_TYPE_LABELS[v.type]}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge variant="outline" className={cn("text-[11px]", VEHICLE_STATUS_CLS[v.status])}>
                                {VEHICLE_STATUS_LABELS[v.status]}
                              </Badge>
                              {isBusy && <span className="text-[10px] text-primary font-medium">{t("fleet.seferde")}</span>}
                              {expiring && (
                                <span className="flex items-center gap-1 text-[10px] text-amber-500">
                                  <AlertTriangle size={9} /> {t("fleet.inspection")} {inspDays}{t("fleet.daysRemaining")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-center">
                            {v.lastLat ? <MapPin size={13} className="text-primary mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card className="shadow-sm overflow-hidden">
              <SectionHeader icon={Route} iconCls="text-primary" title={t("fleet.recentTrips")} linkHref="/filo/seferler" linkLabel={t("fleet.all")} />
              {trips.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">{t("fleet.noTrips")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs uppercase tracking-wider font-semibold">{t("fleet.tripRoute")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-center">{t("common.status")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-right">{t("fleet.operation")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.slice(0, 7).map((trip) => (
                      <TableRow key={trip.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="py-2.5">
                          <p className="text-xs font-semibold text-primary tabular-nums mb-0.5">{trip.tripNumber}</p>
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <span className="max-w-[90px] truncate">{trip.origin}</span>
                            <ChevronRight size={9} className="shrink-0" />
                            <span className="max-w-[90px] truncate">{trip.destination}</span>
                          </p>
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          <Badge variant="outline" className={cn("text-[11px]", TRIP_STATUS_CLS[trip.status])}>
                            {TRIP_STATUS_LABELS[trip.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {trip.status === "PLANLANMIS" && (
                            <Button variant="outline" size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => startMutation.mutate(trip.id)}>
                              {t("fleet.startTrip")}
                            </Button>
                          )}
                          {trip.status === "YOLDA" && (
                            <Button variant="outline" size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                const km = prompt(`${t("fleet.araclar.kmPlaceholder")}:`);
                                if (km) completeMutation.mutate({ id: trip.id, endKm: Number(km) });
                              }}>
                              {t("fleet.completeTrip")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card className="shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-sm font-semibold text-foreground">{t("fleet.upcomingDocuments")}</span>
              </div>
              {alerts.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <CheckCircle size={16} className="text-primary" /> {t("fleet.allDocsUpToDate")}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs uppercase tracking-wider font-semibold">{t("fleet.vehicleCol")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold">{t("fleet.document")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-right">{t("fleet.duration")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((a, i) => (
                      <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="py-2.5">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle size={12} className={a.days <= 7 ? "text-destructive" : "text-amber-500"} />
                            <span className="font-semibold text-sm text-foreground">{a.plate}</span>
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-muted-foreground">{a.label}</TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className={cn("text-sm font-semibold tabular-nums", a.days <= 7 ? "text-destructive" : "text-amber-500")}>
                            {a.days === 0 ? t("fleet.today") : `${a.days} ${t("fleet.daysRemaining")}`}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card className="shadow-sm overflow-hidden">
              <SectionHeader icon={Users} iconCls="text-primary" title={t("fleet.drivers")} linkHref="/filo/suruculer" linkLabel={t("fleet.all")} />
              {drivers.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">{t("fleet.noDrivers")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs uppercase tracking-wider font-semibold">{t("fleet.driverCol")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-center">{t("fleet.licenseClass")}</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-semibold text-center">{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.slice(0, 7).map((d) => {
                      const licDays = daysUntil(d.licenseExpires);
                      const licWarn = licDays !== null && licDays >= 0 && licDays <= 60;
                      const isBusy = busyDriverIds.has(d.id);
                      return (
                        <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                                {d.firstName[0]}{d.lastName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{d.firstName} {d.lastName}</p>
                                {licWarn && (
                                  <p className="flex items-center gap-1 text-[10px] text-amber-500 mt-0.5">
                                    <AlertTriangle size={9} /> {t("fleet.licenseExpiring").replace("{days}", String(licDays))}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-center text-sm font-semibold text-muted-foreground">
                            {t("fleet.licenseClass")} {d.licenseClass}
                          </TableCell>
                          <TableCell className="py-2.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs text-muted-foreground">{DRIVER_STATUS_LABELS[d.status]}</span>
                              {isBusy && <span className="text-[10px] text-primary font-medium">{t("fleet.seferde")}</span>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          <Card className="shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard size={14} className="text-amber-500" /> {t("fleet.hgsOgsPanel")}
              </span>
              <div className="flex items-center gap-2">
                <Select value={hgsVehicleFilter} onValueChange={setHgsVehicleFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder={t("fleet.allVehicles")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={HGS_VEHICLE_ALL}>{t("fleet.allVehicles")}</SelectItem>
                    {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowHgsModal(true)}>
                  <Plus size={12} /> {t("fleet.addPassage")}
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-[1fr_2fr]">
              <div className="border-r border-border">
                <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                  {t("fleet.byVehicleTotal")}
                </p>
                {!hgsSummaryData?.byVehicle?.length ? (
                  <p className="px-4 py-6 text-xs text-center text-muted-foreground">{t("fleet.noPassages")}</p>
                ) : (
                  hgsSummaryData.byVehicle.slice(0, 8).map((row) => (
                    <div key={row.vehicleId} className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{row.plate}</p>
                        <p className="text-[11px] text-muted-foreground">{row.count} {t("fleet.transactions")}</p>
                      </div>
                      <span className="text-sm font-bold text-amber-500 tabular-nums">{formatCurrency(kurusToTl(row.amountKurus))}</span>
                    </div>
                  ))
                )}
              </div>

              <div>
                <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                  {t("fleet.recentPassages")}
                </p>
                {!hgsListData?.data?.length ? (
                  <p className="px-4 py-6 text-xs text-center text-muted-foreground">
                    {hgsVehicleFilter !== HGS_VEHICLE_ALL ? t("fleet.noPassagesForVehicle") : t("fleet.noPassages")}
                  </p>
                ) : (
                  hgsListData.data.map((rec: HgsRecord) => (
                    <div key={rec.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] font-bold shrink-0",
                          rec.deviceType === "HGS" ? "bg-amber-500/15 text-amber-500" : "bg-primary/15 text-primary"
                        )}
                      >
                        {rec.deviceType}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{rec.location ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(rec.transactionDate)}{rec.direction ? ` · ${rec.direction}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-amber-500 tabular-nums">{formatCurrency(kurusToTl(rec.amountKurus))}</p>
                        {rec.balanceKurus !== undefined && (
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {t("fleet.remaining")}: {formatCurrency(kurusToTl(rec.balanceKurus))}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      <NewHgsModal
        vehicles={vehicles}
        open={showHgsModal}
        onClose={() => setShowHgsModal(false)}
        onSuccess={() => showToast(t("fleet.hgsModal.passageSaved"), "success")}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
