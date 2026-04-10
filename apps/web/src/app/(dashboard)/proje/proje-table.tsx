"use client";

export type { Project, ProjectStatus, CostType } from "@/services/project";
export { COST_TYPE_LABELS } from "@/services/project";

export interface ProjeKolonu {
  id: string;
  header: string;
  className?: string;
}

export function buildProjeColumns(t: (k: string) => string): ProjeKolonu[] {
  return [
    { id: "expand",      header: "",                                    className: "w-8" },
    { id: "code",        header: t("finance.project.projectCodeName")                   },
    { id: "customer",    header: t("finance.project.customer")                          },
    { id: "status",      header: t("finance.project.status"),           className: "w-28" },
    { id: "budget",      header: t("finance.project.budget"),           className: "text-right w-40" },
    { id: "budgetUsage", header: t("finance.project.budgetUsage"),      className: "w-28" },
    { id: "startDate",   header: t("finance.project.startDate"),        className: "w-32" },
    { id: "actions",     header: "",                                    className: "w-72" },
  ];
}
