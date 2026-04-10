"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FileText, Plus, Search,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from "lucide-react";
import { financialApi } from "@/services/financial";
import { useI18n } from "@/hooks/use-i18n";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FaturaKpiClient } from "./fatura-kpi-client";
import { buildFaturaColumns, type Fatura } from "./fatura-table";

export default function FaturaClientPage() {
  const { t } = useI18n();
  const columns = useMemo(() => buildFaturaColumns(t), [t]);

  // ── Tablo state ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<Fatura[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── KPI state ─────────────────────────────────────────────────────────────────
  const [kpiOnaylanan, setKpiOnaylanan] = useState(0);
  const [kpiBekleyen, setKpiBekleyen] = useState(0);
  const [kpiReddedilen, setKpiReddedilen] = useState(0);
  const [kpiToplamKurus, setKpiToplamKurus] = useState(0);

  // ── KPI fetch (mount'ta bir kez) ──────────────────────────────────────────────
  useEffect(() => {
    financialApi.invoices
      .list({ limit: 500 })
      .then((res) => {
        const items = (res.data ?? []) as Fatura[];
        setKpiOnaylanan(items.filter((f) => f.status === "ACCEPTED_GIB").length);
        setKpiBekleyen(
          items.filter((f) => f.status === "PENDING_GIB" || f.status === "SENT_GIB").length,
        );
        setKpiReddedilen(items.filter((f) => f.status === "REJECTED_GIB").length);
        setKpiToplamKurus(
          items
            .filter((f) => f.direction === "OUT" && f.status !== "CANCELLED")
            .reduce((s, f) => s + Number(f.total), 0),
        );
      })
      .catch(() => {});
  }, []);

  // ── Tablo fetch (debounced) ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const res = await financialApi.invoices.list({
            search: search || undefined,
            status: statusFilter !== "all" ? (statusFilter as Fatura["status"]) : undefined,
            direction:
              directionFilter !== "all" ? (directionFilter as Fatura["direction"]) : undefined,
            limit,
            offset: (page - 1) * limit,
          });
          setData((res.data ?? []) as Fatura[]);
          setTotal(res.total ?? 0);
        } catch {
          setData([]);
          setTotal(0);
        } finally {
          setLoading(false);
        }
      },
      search ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [search, statusFilter, directionFilter, page, limit]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 1. Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("invoice.title")}</h1>
          <span className="text-sm text-muted-foreground">
            {total} {t("invoice.records")}
          </span>
        </div>
        <Button asChild>
          <Link href="/faturalar/yeni">
            <Plus className="h-4 w-4 mr-2" />
            {t("invoice.newInvoice")}
          </Link>
        </Button>
      </div>

      {/* 2. KPI Kartları */}
      <FaturaKpiClient
        onaylanan={kpiOnaylanan}
        bekleyen={kpiBekleyen}
        reddedilen={kpiReddedilen}
        toplamKurus={kpiToplamKurus}
      />

      {/* 3. Arama + Filtreler (DataTable DIŞINDA) */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("invoice.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("invoice.filter.placeholder.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("invoice.filter.status.all")}</SelectItem>
            <SelectItem value="DRAFT">{t("invoice.filter.status.DRAFT")}</SelectItem>
            <SelectItem value="PENDING_GIB">{t("invoice.filter.status.PENDING_GIB")}</SelectItem>
            <SelectItem value="SENT_GIB">{t("invoice.filter.status.SENT_GIB")}</SelectItem>
            <SelectItem value="ACCEPTED_GIB">{t("invoice.filter.status.ACCEPTED_GIB")}</SelectItem>
            <SelectItem value="REJECTED_GIB">{t("invoice.filter.status.REJECTED_GIB")}</SelectItem>
            <SelectItem value="CANCELLED">{t("invoice.filter.status.CANCELLED")}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={directionFilter}
          onValueChange={(v) => {
            setDirectionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("invoice.filter.placeholder.direction")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("invoice.filter.direction.all")}</SelectItem>
            <SelectItem value="OUT">{t("invoice.filter.direction.OUT")}</SelectItem>
            <SelectItem value="IN">{t("invoice.filter.direction.IN")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. DataTable (Card içinde, sadece tablo) */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={loading ? [] : data}
            showToolbar={false}
            showFooter={false}
            totalCount={total}
            page={page}
            serverLimit={limit}
          />
        </CardContent>
      </Card>

      {/* 5. Pagination (DataTable DIŞINDA) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("invoice.pagination.records")}</span>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("invoice.pagination.perPage")}</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => {
                setLimit(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span>
            {page} / {pageCount}
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(1)}
              disabled={page === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageCount}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(pageCount)}
              disabled={page >= pageCount}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
