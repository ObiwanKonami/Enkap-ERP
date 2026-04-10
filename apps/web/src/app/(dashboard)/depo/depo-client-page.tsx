'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { Boxes, MapPin, Plus, History } from "lucide-react";
import { stockApi } from "@/services/stock";
import type { Warehouse } from "@/services/stock";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function DepoClientPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await stockApi.warehouses.list();
        const items = Array.isArray(response.data) ? response.data : [];
        setData(items);
      } catch (error) {
        console.error('Failed to fetch warehouses:', error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const depolar = data;
  const aktifSayisi = depolar.filter((d) => d.isActive).length;
  const pasifSayisi = depolar.filter((d) => !d.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Boxes size={20} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("stock.warehouses.warehouses")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {depolar.length} {t("stock.warehouses.warehousesCount_label")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="h-9 gap-2">
            <Link href="/stok/hareketler">
              <History size={14} /> {t("stock.warehouses.movementHistory")}
            </Link>
          </Button>
          <Button size="sm" asChild className="h-9 gap-2 shadow-sm">
            <Link href="/depo/yeni">
              <Plus size={14} /> {t("stock.warehouses.newWarehouse")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.warehouses.totalWarehouses")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{isLoading ? '—' : depolar.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("stock.warehouses.defined")}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("stock.warehouses.active")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{isLoading ? '—' : aktifSayisi}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("stock.warehouses.activeMoving")}</p>
          </CardContent>
        </Card>

        {pasifSayisi > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.warehouses.passive")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{isLoading ? '—' : pasifSayisi}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("stock.warehouses.closedWarehouse")}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {isLoading ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-5">
            <Boxes size={28} className="text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          </CardContent>
        </Card>
      ) : depolar.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {depolar.map((depo) => (
            <WarehouseCard key={depo.id} depo={depo} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function WarehouseCard({ depo, t }: { depo: Warehouse; t: (key: string) => string }) {
  return (
    <Link href={`/depo/${depo.id}`} className="group">
      <Card className="h-full shadow-sm transition-all hover:border-primary/30 hover:shadow-md cursor-pointer">
        <CardContent className="p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground leading-tight truncate">
              {depo.name}
            </p>
            <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
              {depo.code}
            </Badge>
          </div>

          {depo.city ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin size={12} className="text-muted-foreground/60 shrink-0" />
              {depo.city}
            </div>
          ) : (
            <div className="h-5" aria-hidden />
          )}

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <Badge variant={depo.isActive ? "default" : "secondary"} className="text-[10px] font-semibold uppercase tracking-wider">
              {depo.isActive ? t("stock.warehouses.active") : t("stock.warehouses.passive")}
            </Badge>
            <span className="text-xs text-primary group-hover:underline">
              {t("stock.warehouses.detailLink")}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="size-14 rounded-2xl bg-muted border border-border flex items-center justify-center">
          <Boxes size={28} className="text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{t("stock.warehouses.noWarehouses")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("stock.warehouses.noWarehousesHint")}</p>
        </div>
        <Button size="sm" asChild className="h-9 gap-2 shadow-sm">
          <Link href="/depo/yeni">
            <Plus size={14} /> {t("stock.warehouses.newWarehouse")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
