"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Search,
  AlertTriangle,
  Check,
  X,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { fleetApi, Driver, DRIVER_STATUS_LABELS } from "@/services/fleet";
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



export default function SuruculerPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function changeStatusFilter(v: string) { setStatusFilter(v); setPage(1); }

  const { data, isLoading } = useQuery({
    queryKey: ["fleet-drivers", statusFilter, page],
    queryFn: () =>
      fleetApi.drivers
        .list({
          status: statusFilter === ALL_STATUS ? undefined : statusFilter || undefined,
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
        })
        .then((r) => r.data),
  });
  const drivers: Driver[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const { data: tripsData } = useQuery({
    queryKey: ["fleet-trips"],
    queryFn: () => fleetApi.trips.list({ limit: 200 }).then((r) => r.data),
  });
  const busyDriverIds = new Set(
    (tripsData?.data ?? [])
      .filter((t) => t.status === "YOLDA" || t.status === "PLANLANMIS")
      .map((t) => t.driverId),
  );

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fleetApi.drivers.update(id, { status: status as Driver["status"] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fleet-drivers"] });
      setToast({
        message: t("fleet.suruculer.statusUpdated"),
        type: "success",
      });
    },
    onError: () =>
      setToast({ message: t("fleet.suruculer.updateFailed"), type: "error" }),
  });

  const filtered = drivers.filter((d) => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
      if (!fullName.includes(q) && !(d.phone ?? "").includes(q)) return false;
    }
    return true;
  });

  const aktif = drivers.filter((d) => d.status === "AKTIF").length;
  const gorevde = busyDriverIds.size;
  const licWarn = drivers.filter((d) => {
    const days = daysUntil(d.licenseExpires);
    return days !== null && days >= 0 && days <= 60;
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
          <Link href="/filo" className="flex items-center gap-1.5 text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-muted-foreground no-underline hover:bg-muted">
            <ArrowLeft size={13} /> {t("fleet.title")}
          </Link>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users size={20} className="text-primary" />
            {t("fleet.drivers")}
          </h1>
        </div>
        <Button asChild>
          <Link href="/filo/suruculer/yeni" className="flex items-center gap-1.5 no-underline">
            <Plus size={14} /> {t("fleet.newDriver")}
          </Link>
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {[
          { label: t("common.total"), value: total, accent: "text-primary" },
          { label: t("fleet.suruculer.activeDrivers"), value: aktif, accent: "text-primary" },
          { label: t("fleet.suruculer.onDuty"), value: gorevde, accent: "text-violet-500" },
          { label: t("fleet.suruculer.licenseWarning"), value: licWarn, accent: licWarn > 0 ? "text-amber-500" : "text-primary" },
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
            <Input
              placeholder={t("fleet.suruculer.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={changeStatusFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder={t("fleet.suruculer.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS}>{t("fleet.suruculer.allStatuses")}</SelectItem>
              <SelectItem value="AKTIF">{t("fleet.driverStatus.AKTIF")}</SelectItem>
              <SelectItem value="PASIF">{t("fleet.driverStatus.PASIF")}</SelectItem>
              <SelectItem value="IZINDE">{t("fleet.driverStatus.IZINDE")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t("fleet.suruculer.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t("fleet.suruculer.noDriverFound")}
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fleet.driverCol")}</TableHead>
                <TableHead className="text-center">{t("fleet.suruculer.licenseClassCol")}</TableHead>
                <TableHead className="text-center">{t("fleet.suruculer.licenseExpiry")}</TableHead>
                <TableHead className="text-center">{t("fleet.suruculer.tripCol")}</TableHead>
                <TableHead className="text-center">{t("common.status")}</TableHead>
                <TableHead className="text-center">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const licDays = daysUntil(d.licenseExpires);
                const licWarn =
                  licDays !== null && licDays >= 0 && licDays <= 60;
                const isBusy = busyDriverIds.has(d.id);
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                          {d.firstName[0]}
                          {d.lastName[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground text-sm">
                            {d.firstName} {d.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {d.phone ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-semibold text-foreground bg-primary/10 px-2 py-0.5 rounded">
                        {d.licenseClass}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {d.licenseExpires ? (
                        <span className={`text-xs flex items-center justify-center gap-0.5 ${licWarn ? "text-amber-500" : "text-muted-foreground"}`}>
                          {licWarn && <AlertTriangle size={10} />}
                          {formatDate(d.licenseExpires)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isBusy ? (
                        <span className="text-xs font-semibold text-violet-500">
                          {t("fleet.suruculer.onDuty")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={
                        d.status === "AKTIF" ? "default" :
                        d.status === "PASIF" ? "secondary" : "outline"
                      }>
                        {DRIVER_STATUS_LABELS[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Select value={d.status} onValueChange={(val) => statusMut.mutate({ id: d.id, status: val })}>
                        <SelectTrigger className="h-7 w-[100px] text-xs mx-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AKTIF">{t("fleet.driverStatus.AKTIF")}</SelectItem>
                          <SelectItem value="PASIF">{t("fleet.driverStatus.PASIF")}</SelectItem>
                          <SelectItem value="IZINDE">{t("fleet.driverStatus.IZINDE")}</SelectItem>
                        </SelectContent>
                      </Select>
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
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} {t("fleet.drivers")}
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
