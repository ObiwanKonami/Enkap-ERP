"use client";

// Bu sayfa expand-row (amortisman geçmişi) özelliği nedeniyle DataTable yerine
// custom Table kullanır. Kolon başlıkları burada tanımlanır, client-page'de kullanılır.

export type { FixedAsset, AssetDepreciation, AssetStatus } from "@/services/asset";
export { CATEGORY_LABELS } from "@/services/asset";

export interface DuranVarlikKolonu {
  id: string;
  header: string;
  className?: string;
}

export function buildDuranVarlikColumns(
  t: (k: string) => string,
): DuranVarlikKolonu[] {
  return [
    { id: "expand",      header: "",                                         className: "w-8" },
    { id: "name",        header: t("finance.fixedAssets.codeAndName") },
    { id: "category",    header: t("finance.fixedAssets.category") },
    { id: "acqDate",     header: t("finance.fixedAssets.acquisitionDate") },
    { id: "cost",        header: t("finance.fixedAssets.cost"),              className: "text-right" },
    { id: "accumDepr",   header: t("finance.fixedAssets.accumulatedDepr"),   className: "text-right" },
    { id: "netBook",     header: t("finance.fixedAssets.netBook"),           className: "text-right" },
    { id: "deprPct",     header: t("finance.fixedAssets.depreciationPct"),   className: "text-center w-28" },
    { id: "status",      header: t("finance.fixedAssets.status"),            className: "text-center" },
    { id: "actions",     header: "",                                         className: "text-center w-20" },
  ];
}
