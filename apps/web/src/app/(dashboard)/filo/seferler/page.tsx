"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Route,
  Plus,
  Search,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import {
  fleetApi,
  Trip,
  Vehicle,
  Driver,
  TRIP_STATUS_LABELS,
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

const LIMIT = 20;

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



export default function SeferlerPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [completeKm, setCompleteKm] = useState<{
    tripId: string;
    km: string;
  } | null>(null);

  function changeStatusFilter(v: string) { setStatusFilter(v); setPage(1); }

  const { data: tripsData, isLoading } = useQuery({
    queryKey: ["fleet-trips", statusFilter, page],
    queryFn: () =>
      fleetApi.trips
        .list({
          status: statusFilter || undefined,
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
        })
        .then((r) => r.data),
  });
  const total = tripsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const { data: vehiclesData } = useQuery({
    queryKey: ["fleet-vehicles"],
    queryFn: () => fleetApi.vehicles.list({ limit: 200 }).then((r) => r.data),
  });
  const { data: driversData } = useQuery({
    queryKey: ["fleet-drivers"],
    queryFn: () => fleetApi.drivers.list({ limit: 200 }).then((r) => r.data),
  });

  const trips: Trip[] = tripsData?.data ?? [];
  const vehicles: Vehicle[] = vehiclesData?.data ?? [];
  const drivers: Driver[] = driversData?.data ?? [];

  const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d]));

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const startMut = useMutation({
    mutationFn: (id: string) => fleetApi.trips.start(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fleet-trips"] });
      showToast(t("fleet.seferler.tripStarted"), "success");
    },
    onError: () => showToast(t("fleet.seferler.tripStartFailed"), "error"),
  });

  const completeMut = useMutation({
    mutationFn: ({ id, endKm }: { id: string; endKm: number }) =>
      fleetApi.trips.complete(id, endKm),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fleet-trips"] });
      setCompleteKm(null);
      showToast(t("fleet.seferler.tripCompleted"), "success");
    },
    onError: () => showToast(t("fleet.seferler.operationFailed"), "error"),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => fleetApi.trips.cancel(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fleet-trips"] });
      showToast(t("fleet.seferler.tripCancelled"), "success");
    },
    onError: () => showToast(t("fleet.seferler.cancelFailed"), "error"),
  });

  const filtered = trips.filter((t_item) => {
    if (statusFilter && t_item.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const v = vehicleMap[t_item.vehicleId];
      if (
        !t_item.tripNumber.toLowerCase().includes(q) &&
        !t_item.origin.toLowerCase().includes(q) &&
        !t_item.destination.toLowerCase().includes(q) &&
        !(v?.plate ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const yolda = trips.filter((t_item) => t_item.status === "YOLDA").length;
  const planlanmis = trips.filter(
    (t_item) => t_item.status === "PLANLANMIS",
  ).length;
  const tamamlandi = trips.filter(
    (t_item) => t_item.status === "TAMAMLANDI",
  ).length;

  return (
    <div className="space-y-5">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {completeKm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <div className="card" style={{ padding: 24, width: 340 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-1)",
                marginBottom: 16,
              }}
            >
              {t("fleet.seferler.endKmTitle")}
            </div>
            <input
              type="number"
              className="input num"
              style={{ width: "100%", marginBottom: 16 }}
              placeholder={t("fleet.seferler.kmPlaceholder")}
              value={completeKm.km}
              onChange={(e) =>
                setCompleteKm((p) => (p ? { ...p, km: e.target.value } : null))
              }
              autoFocus
            />
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button className="btn-ghost" onClick={() => setCompleteKm(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn-primary h-9 px-4 text-sm"
                disabled={!completeKm.km || completeMut.isPending}
                onClick={() =>
                  completeMut.mutate({
                    id: completeKm.tripId,
                    endKm: Number(completeKm.km),
                  })
                }
              >
                {completeMut.isPending
                  ? t("fleet.seferler.saving")
                  : t("fleet.completeTrip")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/filo"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              background: "rgba(30,58,95,0.3)",
              border: "1px solid rgba(30,58,95,0.5)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--text-2)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={13} /> {t("fleet.title")}
          </Link>
          <h1
            className="text-xl font-bold text-text-1"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Route size={20} style={{ color: "#A78BFA" }} /> {t("fleet.trips")}
          </h1>
        </div>
        <Link
          href="/filo/seferler/yeni"
          className="btn-primary h-9 px-4 text-sm"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
          }}
        >
          <Plus size={14} /> {t("fleet.newTrip")}
        </Link>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: t("common.total"), value: trips.length, color: "#A78BFA" },
          { label: t("fleet.onTrip"), value: yolda, color: "#FCD34D" },
          {
            label: t("fleet.seferler.plannedTrip"),
            value: planlanmis,
            color: "#60A5FA",
          },
          {
            label: t("fleet.seferler.tripEnded"),
            value: tamamlandi,
            color: "#34D399",
          },
        ].map((k) => (
          <div
            key={k.label}
            className="card"
            style={{ flex: 1, minWidth: 130, padding: "16px 20px" }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              {k.label}
            </div>
            <div
              className="num"
              style={{ fontSize: 22, fontWeight: 700, color: k.color }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          padding: "12px 16px",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-3)",
            }}
          />
          <input
            placeholder={t("fleet.seferler.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              height: 36,
              paddingLeft: 32,
              paddingRight: 12,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-1)",
              fontSize: 13,
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => changeStatusFilter(e.target.value)}
          style={{
            height: 36,
            padding: "0 10px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-2)",
            fontSize: 13,
          }}
        >
          <option value="">{t("fleet.seferler.allStatuses")}</option>
          <option value="PLANLANMIS">{t("fleet.seferler.plannedTrip")}</option>
          <option value="YOLDA">{t("fleet.onTrip")}</option>
          <option value="TAMAMLANDI">{t("fleet.seferler.tripEnded")}</option>
          <option value="IPTAL">{t("fleet.tripStatus.IPTAL")}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t("fleet.seferler.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t("fleet.seferler.noTripFound")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fleet.seferler.tripNumber")}</TableHead>
                <TableHead>{t("fleet.seferler.route")}</TableHead>
                <TableHead>{t("fleet.seferler.vehicleCol")}</TableHead>
                <TableHead>{t("fleet.seferler.driverCol")}</TableHead>
                <TableHead className="text-center">{t("fleet.seferler.plannedDeparture")}</TableHead>
                <TableHead className="text-center">{t("common.status")}</TableHead>
                <TableHead className="text-center">{t("fleet.seferler.operations")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t_item) => {
                const vehicle = vehicleMap[t_item.vehicleId];
                const driver = driverMap[t_item.driverId];
                return (
                  <TableRow key={t_item.id}>
                    <TableCell>
                      <span className="font-bold text-violet-500 text-sm">
                        {t_item.tripNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "var(--text-1)",
                        }}
                      >
                        <span
                          style={{
                            maxWidth: 110,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t_item.origin}
                        </span>
                        <ChevronRight
                          size={11}
                          style={{ color: "var(--text-3)", flexShrink: 0 }}
                        />
                        <span
                          style={{
                            maxWidth: 110,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t_item.destination}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {vehicle ? (
                        <div>
                          <div className="font-semibold text-foreground text-sm">
                            {vehicle.plate}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {vehicle.brand} {vehicle.model}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {driver ? (
                        <span className="text-sm text-foreground">
                          {driver.firstName} {driver.lastName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(t_item.plannedDeparture)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={
                        t_item.status === "TAMAMLANDI" ? "default" :
                        t_item.status === "IPTAL" ? "destructive" : "outline"
                      }>
                        {TRIP_STATUS_LABELS[t_item.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1.5 justify-center">
                        {t_item.status === "PLANLANMIS" && (
                          <>
                            <button
                              style={{
                                fontSize: 11,
                                padding: "3px 10px",
                                borderRadius: 5,
                                border: "1px solid rgba(52,211,153,0.3)",
                                background: "rgba(52,211,153,0.1)",
                                color: "#34D399",
                                cursor: "pointer",
                              }}
                              onClick={() => startMut.mutate(t_item.id)}
                              disabled={startMut.isPending}
                            >
                              {t("fleet.startTrip")}
                            </button>
                            <button
                              style={{
                                fontSize: 11,
                                padding: "3px 10px",
                                borderRadius: 5,
                                border: "1px solid rgba(239,68,68,0.3)",
                                background: "rgba(239,68,68,0.1)",
                                color: "#F87171",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                if (confirm(t("fleet.seferler.cancelConfirm")))
                                  cancelMut.mutate(t_item.id);
                              }}
                            >
                              {t("common.cancel")}
                            </button>
                          </>
                        )}
                        {t_item.status === "YOLDA" && (
                          <button
                            style={{
                              fontSize: 11,
                              padding: "3px 10px",
                              borderRadius: 5,
                              border: "1px solid rgba(56,189,248,0.3)",
                              background: "rgba(56,189,248,0.1)",
                              color: "#38BDF8",
                              cursor: "pointer",
                            }}
                            onClick={() =>
                              setCompleteKm({ tripId: t_item.id, km: "" })
                            }
                          >
                            {t("fleet.completeTrip")}
                          </button>
                        )}
                        {(t_item.status === "TAMAMLANDI" ||
                          t_item.status === "IPTAL") && (
                          <span
                            style={{ fontSize: 11, color: "var(--text-3)" }}
                          >
                            —
                          </span>
                        )}
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
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} {t("fleet.trips")}
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
