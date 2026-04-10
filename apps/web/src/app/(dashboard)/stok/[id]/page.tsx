import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { formatCurrency, formatDateTime, fmtQty, kurusToTl } from "@/lib/format";
import { StokUrun } from "../page";
import Link from "next/link";
import {
  Package,
  ArrowLeft,
  Barcode,
  Layers,
  TrendingDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const t = createTranslator(DEFAULT_LOCALE);

export const dynamic = "force-dynamic";
export const metadata = {
  title: `${t("stock.product")} ${t("common.detail") ?? "Detay"} — Enkap`,
};

interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  unitCostKurus: number;
  warehouse?: { id: string; name: string; code: string };
  product?: { id: string; name: string };
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

type RawUrun = Omit<StokUrun, "categoryName"> & {
  category?: { id: string; name: string } | null;
};

function mapUrun(raw: RawUrun): StokUrun {
  return { ...raw, categoryName: raw.category?.name ?? undefined };
}

async function fetchUrun(id: string, token: string) {
  const [urun, warehouseStock, movements] = await Promise.allSettled([
    serverFetch<RawUrun>("stock", `/products/${id}`, token).then(mapUrun),
    serverFetch<WarehouseStock[]>("stock", `/products/${id}/stock`, token),
    serverFetch<{ data: StockMovement[]; total: number }>(
      "stock",
      `/movements/product/${id}?limit=20`,
      token,
    ).then((r) => r.data),
  ]);
  return {
    urun: urun.status === "fulfilled" ? urun.value : null,
    warehouseStock:
      warehouseStock.status === "fulfilled"
        ? warehouseStock.value
        : ([] as WarehouseStock[]),
    movements:
      movements.status === "fulfilled"
        ? movements.value
        : ([] as StockMovement[]),
  };
}

const MOV_MAP: Record<string, { label: string; icon: React.ReactNode }> = {
  GIRIS: {
    label: t("stock.movementType.GIRIS"),
    icon: <ArrowDownToLine size={13} />,
  },
  CIKIS: {
    label: t("stock.movementType.CIKIS"),
    icon: <ArrowUpFromLine size={13} />,
  },
  TRANSFER: {
    label: t("stock.movementType.TRANSFER"),
    icon: <RefreshCw size={13} />,
  },
  SAYIM: {
    label: t("stock.movementType.SAYIM"),
    icon: <Layers size={13} />,
  },
  IADE_GIRIS: {
    label: t("stock.movementType.IADE_GIRIS"),
    icon: <ArrowDownToLine size={13} />,
  },
  IADE_CIKIS: {
    label: t("stock.movementType.IADE_CIKIS"),
    icon: <ArrowUpFromLine size={13} />,
  },
  FIRE: {
    label: t("stock.movementType.FIRE"),
    icon: <TrendingDown size={13} />,
  },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right">
        {value}
      </span>
    </div>
  );
}

export default async function StokDetayPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const { urun, warehouseStock, movements } = await fetchUrun(
    params.id,
    session?.user.accessToken ?? "",
  );

  if (!urun) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link href="/stok">
            <ArrowLeft size={13} />
            {t("stock.geriDon")}
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground text-center py-10">
          {t("stock.productNotFound")}
        </p>
      </div>
    );
  }

  const kritik = Number(urun.totalStockQty) <= Number(urun.reorderPoint);
  const marginPct =
    urun.avgUnitCostKurus > 0
      ? ((urun.listPriceKurus - urun.avgUnitCostKurus) / urun.listPriceKurus) *
        100
      : 0;
  const stokDeger = kurusToTl(
    Number(urun.totalStockQty) * Number(urun.avgUnitCostKurus),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/stok">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Package size={20} className="text-muted-foreground" />
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {urun.name}
              </h1>
              {kritik && (
                <Badge variant="destructive" className="gap-1">
                  <TrendingDown size={11} />
                  {t("stock.kritikUyarisi")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 tabular-nums">
              {urun.sku}
              {urun.categoryName && <span> · {urun.categoryName}</span>}
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href={`/stok/${params.id}/duzenle`}>
            <Pencil size={13} />
            {t("stock.duzenle")}
          </Link>
        </Button>
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.totalStock")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold tracking-tight tabular-nums", kritik ? "text-destructive" : "text-foreground")}>
              {fmtQty(urun.totalStockQty)} <span className="text-sm font-normal text-muted-foreground">{urun.unitCode}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("stock.min")} {fmtQty(urun.reorderPoint)} {urun.unitCode}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.stockValue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {formatCurrency(stokDeger)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("stock.costBased")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.listPrice")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {formatCurrency(kurusToTl(urun.listPriceKurus))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {urun.costMethod} {t("stock.yontem")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.margin")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold tracking-tight tabular-nums", marginPct >= 20 ? "text-foreground" : "text-destructive")}>
              %{marginPct.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("stock.grossMargin")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ana içerik */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol: Ürün bilgileri + depo dağılımı */}
        <div className="flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.productInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-0">
              <InfoRow label={t("stock.sku")} value={<span className="tabular-nums">{urun.sku}</span>} />
              <InfoRow
                label={t("stock.barcode")}
                value={
                  urun.barcode ? (
                    <span className="flex items-center gap-1 tabular-nums">
                      <Barcode size={12} />
                      {urun.barcode}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
              <InfoRow label={t("stock.category")} value={urun.categoryName ?? "—"} />
              <InfoRow label={t("stock.unit")} value={urun.unitCode} />
              <InfoRow label={t("stock.costMethod_label")} value={urun.costMethod} />
              <InfoRow label={t("stock.avgCost")} value={<span className="tabular-nums">{formatCurrency(kurusToTl(urun.avgUnitCostKurus))}</span>} />
              <InfoRow label={t("stock.listPrice")} value={<span className="tabular-nums">{formatCurrency(kurusToTl(urun.listPriceKurus))}</span>} />
              <InfoRow label={t("stock.reorderPoint_label")} value={`${fmtQty(urun.reorderPoint)} ${urun.unitCode}`} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.warehouseDistribution")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {warehouseStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("stock.noWarehouseRecord")}</p>
              ) : (
                <div className="grid gap-3">
                  {warehouseStock.map((ws) => {
                    const pct =
                      Number(urun.totalStockQty) > 0
                        ? Math.round(
                            (Number(ws.quantity) / Number(urun.totalStockQty)) *
                              100,
                          )
                        : 0;
                    return (
                      <div key={ws.warehouseId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-foreground">{ws.warehouseName}</span>
                          <span className="font-semibold tabular-nums">{fmtQty(ws.quantity)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">%{pct}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sağ: Stok hareketleri */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.stockMovements")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("stock.noStockMovements")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">{t("stock.tabloTuru")}</TableHead>
                    <TableHead className="text-[10px] uppercase text-right">{t("stock.tabloMiktar")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("stock.tabloBirim")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("stock.tabloDepo")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("stock.tabloReferans")}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t("stock.tabloTarih")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => {
                    const meta = MOV_MAP[m.type] ?? {
                      label: m.type,
                      icon: null,
                    };
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            {meta.icon}
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-right tabular-nums">
                          +{fmtQty(m.quantity)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{urun.unitCode}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.warehouse?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.referenceId ? (
                            <span className="text-primary tabular-nums">{m.referenceId}</span>
                          ) : (
                            <span className="text-muted-foreground">{m.notes ?? "—"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(m.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";