import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { formatCurrency, formatDateTime, fmtQty, kurusToTl } from "@/lib/format";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  MapPin,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  SlidersHorizontal,
  XCircle,
  Pencil,
  ArrowRight,
} from "lucide-react";
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
  TableFooter,
} from "@/components/ui/table";

export const metadata = { title: "Depo Detayı — Enkap" };

interface Warehouse {
  id: string;
  name: string;
  code: string;
  city?: string;
  isActive: boolean;
}

interface WarehouseProduct {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCode: string;
  reorderPoint: number;
  avgUnitCostKurus: number;
}

interface StockMovement {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  type: string;
  quantity: number;
  unitCostKurus: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

function getRefTypeLabel(refType: string | null, t: (key: string) => string): string {
  if (!refType) return "—";
  return t(`stock.warehouses.referenceTypes.${refType}`) ?? refType.replace(/_/g, " ");
}

function getMovementMeta(type: string, t: (key: string) => string): { label: string; icon: React.ReactNode } {
  const meta: Record<string, { labelKey: string; icon: React.ReactNode }> = {
    GIRIS: { labelKey: "stock.movementType.GIRIS", icon: <ArrowDownToLine size={11} /> },
    CIKIS: { labelKey: "stock.movementType.CIKIS", icon: <ArrowUpFromLine size={11} /> },
    TRANSFER: { labelKey: "stock.movementType.TRANSFER", icon: <RefreshCw size={11} /> },
    SAYIM: { labelKey: "stock.movementType.SAYIM", icon: <SlidersHorizontal size={11} /> },
    IADE_GIRIS: { labelKey: "stock.movementType.IADE_GIRIS", icon: <ArrowDownToLine size={11} /> },
    IADE_CIKIS: { labelKey: "stock.movementType.IADE_CIKIS", icon: <ArrowUpFromLine size={11} /> },
    FIRE: { labelKey: "stock.movementType.FIRE", icon: <XCircle size={11} /> },
  };
  const entry = meta[type];
  return entry ? { label: t(entry.labelKey), icon: entry.icon } : { label: type, icon: null };
}

async function fetchWarehouse(id: string, token: string): Promise<Warehouse | null> {
  return serverFetch<Warehouse>("stock", `/warehouses/${id}`, token).catch(() => null);
}

async function fetchProducts(id: string, token: string): Promise<WarehouseProduct[]> {
  return serverFetch<WarehouseProduct[]>("stock", `/warehouses/${id}/products`, token).catch(() => []);
}

async function fetchMovements(id: string, token: string): Promise<StockMovement[]> {
  return serverFetch<{ data: StockMovement[]; total: number } | StockMovement[]>("stock", `/movements/warehouse/${id}`, token)
    .then((res) => (Array.isArray(res) ? res : res.data))
    .catch(() => []);
}

export default async function DepoDetayPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const token = session?.user.accessToken ?? "";
  const { id } = params;

  const t = createTranslator(DEFAULT_LOCALE);

  const [depo, products, movements] = await Promise.all([
    fetchWarehouse(id, token),
    fetchProducts(id, token),
    fetchMovements(id, token),
  ]);

  if (!depo) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link href="/depo">
            <ArrowLeft size={13} /> {t("common.back")}
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground text-center py-10">
          {t("stock.warehouses.warehouseNotFound")}
        </p>
      </div>
    );
  }

  const kritikUrunler = products.filter((p) => p.quantity <= p.reorderPoint);
  const toplamStokDeger = products.reduce((s, p) => s + kurusToTl(p.quantity * p.avgUnitCostKurus), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/depo">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Boxes size={20} className="text-muted-foreground" />
              <h1 className="text-xl font-bold tracking-tight">{depo.name}</h1>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] ">{depo.code}</Badge>
              {depo.city && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin size={11} /> {depo.city}
                </span>
              )}
              <Badge variant={depo.isActive ? "default" : "secondary"} className="text-[10px]">
                {depo.isActive ? t("stock.warehouses.active") : t("stock.warehouses.passive")}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/depo/${id}/duzenle`}>
              <Pencil size={14} /> {t("stock.warehouses.edit")}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/stok/hareket">
              <ArrowDownToLine size={14} /> {t("stock.warehouses.enterMovement")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.warehouses.productCount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{products.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("stock.warehouses.differentProducts")}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.warehouses.stockValue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(toplamStokDeger)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("stock.costBased")}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.warehouses.lastMovement")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {movements.length > 0 ? formatDateTime(movements[0].createdAt).split(" ")[0] : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {movements.length} {t("stock.warehouses.totalMovements")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.criticalStock")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${kritikUrunler.length > 0 ? "text-destructive" : ""}`}>
              {kritikUrunler.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("stock.reorderNeeded")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("stock.warehouses.productStockDistribution")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("stock.warehouses.sku")}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("stock.warehouses.productName")}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t("stock.quantity")}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t("stock.warehouses.unitCost")}</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t("stock.warehouses.stockValueColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    {t("stock.warehouses.noProducts")}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => {
                  const isKritik = p.quantity <= p.reorderPoint;
                  return (
                    <TableRow key={p.productId} className="hover:bg-muted/30">
                      <TableCell>
                        <Link href={`/stok/${p.productId}`} className="text-xs text-primary hover:underline">
                          {p.sku}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{p.productName}</TableCell>
                      <TableCell className="text-right">
                        <span className={isKritik ? "text-destructive font-semibold" : "font-semibold"}>
                          {fmtQty(p.quantity)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">{p.unitCode}</span>
                        {isKritik && <Badge variant="destructive" className="ml-2 text-[9px]">{t("stock.warehouses.critical")}</Badge>}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(kurusToTl(p.avgUnitCostKurus))}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(kurusToTl(p.quantity * p.avgUnitCostKurus))}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="border-t-2">
                <TableCell colSpan={4} className="font-medium text-muted-foreground">{t("stock.warehouses.total")}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{formatCurrency(toplamStokDeger)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.warehouses.recentMovements")}
            </CardTitle>
            <Link href="/stok/hareketler" className="text-xs text-primary hover:underline">
              {t("stock.warehouses.allMovements")}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {movements.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">{t("stock.warehouses.noMovements")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("common.date")}</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("stock.warehouses.type")}</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("stock.product")}</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t("stock.quantity")}</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("stock.warehouses.reference")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const meta = getMovementMeta(m.type, t);
                  const isPositive = m.quantity > 0;
                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDateTime(m.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          {meta.icon}
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.product?.name ?? m.productId}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${isPositive ? "text-primary" : "text-destructive"}`}>
                        {isPositive ? "+" : ""}{fmtQty(m.quantity)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.referenceId ? (
                          <span className="text-xs">
                            {getRefTypeLabel(m.referenceType, t)} · {m.referenceId}
                          </span>
                        ) : m.notes ? (
                          <span className="italic text-xs">{m.notes}</span>
                        ) : "—"}
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
  );
}