"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Plus,
  Search,
  AlertTriangle,
  MapPin,
  ArrowLeft,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import {
  fleetApi,
  Vehicle,
  VEHICLE_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
} from "@/services/fleet";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { X, Check, AlertCircle } from "lucide-react";

const LIMIT = 20;
const ALL_STATUS = "__ALL__";

function daysUntil(d?: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background:
          type === "success" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
        border: `1px solid ${type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
        borderRadius: 8,
        padding: "10px 16px",
        color: type === "success" ? "#34D399" : "#F87171",
        fontSize: 13,
      }}
    >
      {type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          marginLeft: 8,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  background: "rgba(30,58,95,0.1)",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
};

export default function AraclarPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function changeStatusFilter(v: string) { setStatusFilter(v); setPage(1); }
  function changeTypeFilter(v: string) { setTypeFilter(v); setPage(1); }

  const { data, isLoading } = useQuery({
    queryKey: ["fleet-vehicles", statusFilter, typeFilter, page],
    queryFn: () =>
      fleetApi.vehicles
        .list({
          status: statusFilter === ALL_STATUS ? undefined : statusFilter || undefined,
          type: typeFilter === ALL_STATUS ? undefined : typeFilter || undefined,
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
        })
        .then((r) => r.data),
  });
  const vehicles: Vehicle[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fleetApi.vehicles.update(id, { status: status as Vehicle["status"] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fleet-vehicles"] });
      setToast({ message: t("fleet.araclar.statusUpdated"), type: "success" });
    },
    onError: () =>
      setToast({ message: t("fleet.araclar.updateFailed"), type: "error" }),
  });

  const filtered = vehicles.filter((v) => {
    if (statusFilter && v.status !== statusFilter) return false;
    if (typeFilter && v.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !v.plate.toLowerCase().includes(q) &&
        !v.brand.toLowerCase().includes(q) &&
        !v.model.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const aktif = vehicles.filter((v) => v.status === "AKTIF").length;
  const bakimda = vehicles.filter((v) => v.status === "BAKIMDA").length;
  const expiring = vehicles.filter((v) => {
    const d = daysUntil(v.inspectionExpires);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  return (
    <div className="space-y-5">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/filo"
            className="flex items-center gap-1.5 text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-muted-foreground no-underline hover:bg-muted"
          >
            <ArrowLeft size={13} /> {t("fleet.title")}
          </Link>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck size={20} className="text-muted-foreground" />
            {t("fleet.vehicles")}
          </h1>
        </div>
        <Button asChild>
          <Link href="/filo/araclar/yeni" className="flex items-center gap-1.5 no-underline">
            <Plus size={14} /> {t("fleet.newVehicle")}
          </Link>
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {[
          {
            label: t("common.total"),
            value: total,
            accent: "text-muted-foreground",
          },
          {
            label: t("fleet.araclar.active"),
            value: aktif,
            accent: "text-primary",
          },
          {
            label: t("fleet.araclar.maintenance"),
            value: bakimda,
            accent: "text-amber-500",
          },
          {
            label: t("fleet.araclar.inspectionWarning"),
            value: expiring,
            accent: expiring > 0 ? "text-destructive" : "text-primary",
          },
        ].map((k) => (
          <Card key={k.label} className="flex-1 min-w-[130px]">
            <CardContent className="pt-4 pb-4">
              <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">
                {k.label}
              </div>
              <div className={`text-[22px] font-bold ${k.accent}`}>
                {k.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 flex gap-2.5 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder={t("fleet.araclar.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={changeStatusFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder={t("fleet.araclar.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS}>{t("fleet.araclar.allStatuses")}</SelectItem>
              <SelectItem value="AKTIF">{t("fleet.vehicleStatus.AKTIF")}</SelectItem>
              <SelectItem value="PASIF">{t("fleet.vehicleStatus.PASIF")}</SelectItem>
              <SelectItem value="BAKIMDA">{t("fleet.vehicleStatus.BAKIM")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={changeTypeFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder={t("fleet.araclar.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS}>{t("fleet.araclar.allTypes")}</SelectItem>
              {(
                [
                  "TIR",
                  "KAMYON",
                  "KAMYONET",
                  "PICKUP",
                  "FORKLIFT",
                  "DIGER",
                ] as const
              ).map((t_type) => (
                <SelectItem key={t_type} value={t_type}>
                  {VEHICLE_TYPE_LABELS[t_type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t("fleet.araclar.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t("fleet.araclar.noVehicleFound")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fleet.vehicles")}</TableHead>
                  <TableHead>{t("fleet.vehicleType")}</TableHead>
                  <TableHead className="text-right">{t("fleet.araclar.km")}</TableHead>
                  <TableHead className="text-center">{t("fleet.inspection")}</TableHead>
                  <TableHead className="text-center">{t("fleet.kasko")}</TableHead>
                  <TableHead className="text-center">{t("fleet.gps")}</TableHead>
                  <TableHead className="text-center">{t("common.status")}</TableHead>
                  <TableHead className="text-center">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filtered.map((v) => {
                const inspDays = daysUntil(v.inspectionExpires);
                const insDays = daysUntil(v.insuranceExpires);
                const inspWarn =
                  inspDays !== null && inspDays >= 0 && inspDays <= 30;
                const insWarn =
                  insDays !== null && insDays >= 0 && insDays <= 30;
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Truck size={15} className="text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground text-sm">
                            {v.plate}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {v.brand} {v.model} {v.year ? `· ${v.year}` : ""}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {VEHICLE_TYPE_LABELS[v.type]}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-foreground">
                        {v.currentKm.toLocaleString("tr-TR")}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {v.inspectionExpires ? (
                        <span className={`text-xs flex items-center justify-center gap-0.5 ${inspWarn ? "text-destructive" : "text-muted-foreground"}`}>
                          {inspWarn && <AlertTriangle size={10} />}
                          {formatDate(v.inspectionExpires)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {v.insuranceExpires ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: insWarn ? "#F87171" : "var(--text-3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                          }}
                        >
                          {insWarn && <AlertTriangle size={10} />}
                          {formatDate(v.insuranceExpires)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {v.lastLat ? (
                        <MapPin size={13} className="text-primary" />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={
                        v.status === "AKTIF" ? "default" :
                        v.status === "PASIF" ? "secondary" : "outline"
                      }>
                        {VEHICLE_STATUS_LABELS[v.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1.5 justify-center items-center">
                        <Select value={v.status} onValueChange={(val) => statusMut.mutate({ id: v.id, status: val })}>
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AKTIF">{t("fleet.vehicleStatus.AKTIF")}</SelectItem>
                            <SelectItem value="PASIF">{t("fleet.vehicleStatus.PASIF")}</SelectItem>
                            <SelectItem value="BAKIMDA">{t("fleet.vehicleStatus.BAKIM")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" className="h-7 w-7" asChild>
                          <Link href={`/filo/araclar/${v.id}/duzenle`} title={t("common.edit")}>
                            <Pencil size={12} />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} {t("fleet.vehicles")}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const n = start + i;
                return (
                  <PaginationItem key={n}>
                    <PaginationLink
                      onClick={() => setPage(n)}
                      isActive={n === page}
                      className="cursor-pointer"
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
