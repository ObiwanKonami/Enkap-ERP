"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Search,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { waybillApi, type Waybill, type WaybillType, type WaybillStatus } from "@/services/waybill";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildIrsaliyeColumns, type IrsaliyeRow } from "./irsaliyeler-table";

const LIMIT = 20;
const ALL_SENTINEL = "__ALL__";

function normalizeWaybill(w: Waybill): IrsaliyeRow {
  return {
    id: w.id,
    waybillNumber: w.waybillNumber,
    type: w.type,
    status: w.status,
    shipDate: w.shipDate,
    senderName: w.senderName,
    receiverName: w.receiverName,
    gibUuid: w.gibUuid,
  };
}

export default function IrsaliyelerClientPage() {
  const { t } = useI18n();

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [data, setData] = useState<IrsaliyeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [kpiTaslak, setKpiTaslak] = useState(0);
  const [kpiOnaylandi, setKpiOnaylandi] = useState(0);
  const [kpiGib, setKpiGib] = useState(0);
  const [kpiIptal, setKpiIptal] = useState(0);

  const columns = useMemo(() => buildIrsaliyeColumns(t), [t]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const TYPES: WaybillType[] = ["SATIS", "ALIS", "TRANSFER", "IADE"];
  const STATUSES: WaybillStatus[] = [
    "TASLAK", "ONAYLANDI", "GIB_KUYRUKTA", "GIB_GONDERILDI",
    "GIB_ONAYLANDI", "GIB_REDDEDILDI", "IPTAL"
  ];

  useEffect(() => {
    waybillApi.list({ limit: 500 })
      .then((res) => {
        const resData = res as unknown as { data: { data: Waybill[] } };
        const items = resData.data?.data ?? [];
        const normalized = items.map(normalizeWaybill);
        setKpiTaslak(normalized.filter((w) => w.status === "TASLAK").length);
        setKpiOnaylandi(normalized.filter((w) => w.status === "ONAYLANDI").length);
        setKpiGib(normalized.filter((w) => ["GIB_KUYRUKTA", "GIB_GONDERILDI"].includes(w.status)).length);
        setKpiIptal(normalized.filter((w) => w.status === "IPTAL").length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await waybillApi.list({
          // @ts-expect-error backend desteklemiyor henüz - sonra kaldırılacak
          search: search || undefined,
          type: typeFilter !== "all" ? typeFilter as WaybillType : undefined,
          status: statusFilter !== "all" ? statusFilter as WaybillStatus : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        const resData = (res as unknown as { data: { data: Waybill[]; total: number } }).data
          ?? res as unknown as { data: Waybill[]; total: number };
        setData((resData.data ?? []).map(normalizeWaybill));
        setTotal(resData.total ?? 0);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, typeFilter, statusFilter, page, limit]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("waybill.title")}</h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <Button asChild>
          <Link href="/irsaliyeler/yeni">
            <Plus className="h-4 w-4 mr-2" />
            {t("waybill.newWaybill")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("waybill.draft")}
            </div>
            <p className="text-3xl font-bold text-muted-foreground">{kpiTaslak}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("waybill.approved")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiOnaylandi}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("waybill.gibInQueue")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiGib}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("waybill.cancelled")}
            </div>
            <p className="text-3xl font-bold text-destructive">{kpiIptal}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("waybill.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("waybill.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("waybill.allTypes")}</SelectItem>
            {TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`waybill.types.${type}` as never) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("waybill.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("waybill.allStatuses")}</SelectItem>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`waybill.statuses.${status}` as never) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && data.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              {t("waybill.loading")}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data}
              showToolbar={false}
              showFooter={false}
              totalCount={total}
              page={page}
              serverLimit={limit}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("waybill.pagination.perPage")}</span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>{page} / {pageCount}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page === 1}>
              <span className="sr-only">First</span>
              <span>«</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <span className="sr-only">Previous</span>
              <span>‹</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              <span className="sr-only">Next</span>
              <span>›</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
              <span className="sr-only">Last</span>
              <span>»</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
