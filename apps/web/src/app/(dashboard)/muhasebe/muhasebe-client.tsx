"use client";

import {
  BookOpen,
  Scale,
  Building2,
  FileSpreadsheet,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CARDS = [
  {
    href: "/muhasebe/mizan",
    icon: Scale,
    titleKey: "accounting.mizan",
    descKey: "accounting.mizanDesc",
  },
  {
    href: "/muhasebe/bilanco",
    icon: Building2,
    titleKey: "accounting.balance",
    descKey: "accounting.balanceDesc",
  },
  {
    href: "/muhasebe/babs",
    icon: FileSpreadsheet,
    titleKey: "accounting.babsTitle",
    descKey: "accounting.babsDesc",
  },
];

export function MuhasebeClient() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <BookOpen size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("accounting.title")}
        </h1>
        <span className="text-sm text-muted-foreground ml-2">
          {t("accounting.subtitle")}
        </span>
      </div>

      {/* Kart listesi */}
      <div className="flex flex-col gap-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Button key={c.href} asChild variant="outline" className="h-auto p-0">
              <Link href={c.href}>
                <Card className="w-full shadow-sm border-0 bg-transparent hover:bg-muted/40 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex-shrink-0 bg-muted border border-border flex items-center justify-center">
                        <Icon size={18} className="text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {t(c.titleKey)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t(c.descKey)}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={15} className="text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
