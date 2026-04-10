"use client";

import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, formatDate, fmtQty, kurusToTl } from "@/lib/format";
import Link from "next/link";
import { FileText } from "lucide-react";
import { StatusBadge, DirectionBadge } from "./invoice-badges";
import { FaturaActions } from "./fatura-actions";
import { MatchingPanel } from "./matching-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { InvoiceDetail, InvoiceItem } from "./page";

interface VatGroup {
  rate: number;
  baseKurus: number;
  vatKurus: number;
}

function buildVatGroups(items: InvoiceItem[]): VatGroup[] {
  const map = new Map<number, VatGroup>();
  for (const item of items) {
    const existing = map.get(item.vatRate);
    if (existing) {
      existing.baseKurus += item.lineTotal;
      existing.vatKurus += item.vatAmount;
    } else {
      map.set(item.vatRate, {
        rate: item.vatRate,
        baseKurus: item.lineTotal,
        vatKurus: item.vatAmount,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

function maskVkn(vkn: string): string {
  if (vkn.length <= 4) return vkn;
  return `${"*".repeat(vkn.length - 4)}${vkn.slice(-4)}`;
}

interface InfoRowProps {
  labelKey: string;
  children: React.ReactNode;
}

function InfoRow({ labelKey, children }: InfoRowProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-xs text-muted-foreground shrink-0 pt-0.5">{t(labelKey)}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

interface FaturaDetayClientProps {
  invoice: InvoiceDetail;
}

export function FaturaDetayClient({ invoice }: FaturaDetayClientProps) {
  const { t } = useI18n();
  const vatGroups = buildVatGroups(invoice.items);
  const showMatchingTab = invoice.type === 'TICARIFATURA' && invoice.direction === 'INCOMING';

  return (
    <div className="space-y-5">
      {/* ─── Geri link ─── */}
      <Link
        href="/faturalar"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        ← {t("invoice.title")}
      </Link>

      {/* ─── Başlık + Aksiyonlar ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <FileText size={20} className="text-primary shrink-0" />
          <h1 className="text-xl font-bold text-foreground num">
            {invoice.invoiceNumber}
          </h1>
          <StatusBadge status={invoice.status} />
          <DirectionBadge direction={invoice.direction} />
        </div>

        <FaturaActions invoiceId={invoice.id} status={invoice.status} />
      </div>

      {/* ─── Tabs: Fatura Detayı + Eşleştirme ─── */}
      <Tabs defaultValue="detail" className="space-y-5">
        <TabsList>
          <TabsTrigger value="detail">{t("invoice.detail")}</TabsTrigger>
          {showMatchingTab && (
            <TabsTrigger value="matching">{t("matching.tab")}</TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: Fatura Detayı */}
        <TabsContent value="detail" className="space-y-5">
      {/* ─── İki sütunlu düzen ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sol: Kalemler + Notlar */}
        <div className="lg:col-span-2 space-y-5">
          {/* Fatura kalemleri tablosu */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t("invoice.lineItems")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t("common.description")}
                    </th>
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                      {t("common.quantity")}
                    </th>
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                      {t("invoice.unitPrice")}
                    </th>
                    <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                      {t("invoice.vatRate")}
                    </th>
                    <th className="pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                      {t("common.total")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoice.items.map((item: InvoiceItem) => (
                    <tr key={item.id} className="group">
                      <td className="py-3 pr-4 text-foreground">
                        {item.description}
                      </td>
                      <td className="py-3 pr-4 tabular-numstext-right text-muted-foreground">
                        {fmtQty(item.quantity)}
                      </td>
                      <td className="py-3 pr-4 tabular-numstext-right text-muted-foreground">
                        {formatCurrency(kurusToTl(item.unitPrice))}
                      </td>
                      <td className="py-3 pr-4 tabular-numstext-right text-muted-foreground">
                        %{item.vatRate}
                      </td>
                      <td className="py-3 tabular-numstext-right text-foreground font-medium">
                        {formatCurrency(kurusToTl(item.lineTotal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Toplamlar bölümü */}
            <div className="mt-4 pt-4 border-t border-border space-y-1.5">
              <div className="flex justify-end items-center gap-8">
                <span className="text-xs text-muted-foreground">
                  {t("invoice.subtotal")}
                </span>
                <span className="tabular-numstext-sm text-muted-foreground w-28 text-right">
                  {formatCurrency(kurusToTl(invoice.subtotalKurus))}
                </span>
              </div>
              <div className="flex justify-end items-center gap-8">
                <span className="text-xs text-muted-foreground">{t("invoice.kdv")}</span>
                <span className="tabular-numstext-sm text-muted-foreground w-28 text-right">
                  {formatCurrency(kurusToTl(invoice.vatTotalKurus))}
                </span>
              </div>
              <div className="flex justify-end items-center gap-8 pt-1 border-t border-border">
                <span className="text-sm font-semibold text-foreground">
                  {t("invoice.total")}
                </span>
                <span className="tabular-numstext-lg font-bold text-primary w-28 text-right">
                  {formatCurrency(kurusToTl(invoice.totalKurus))}
                </span>
              </div>
            </div>
          </div>

          {/* Notlar */}
          {invoice.notes && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">
                {t("common.notes")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        {/* Sağ: Fatura Bilgileri + KDV Özeti */}
        <div className="lg:col-span-1 space-y-5">
          {/* Fatura Bilgileri */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t("invoice.invoiceInfo")}
            </h2>
            <dl className="space-y-2.5">
              <InfoRow labelKey="invoice.number">
                <span className="tabular-numstext-sm text-foreground">
                  {invoice.invoiceNumber}
                </span>
              </InfoRow>
              <InfoRow labelKey="invoice.date">
                <span className="tabular-numstext-sm text-muted-foreground">
                  {formatDate(invoice.issueDate)}
                </span>
              </InfoRow>
              {invoice.dueDate && (
                <InfoRow labelKey="invoice.dueDate">
                  <span className="tabular-numstext-sm text-muted-foreground">
                    {formatDate(invoice.dueDate)}
                  </span>
                </InfoRow>
              )}
              <InfoRow labelKey="invoice.direction">
                <DirectionBadge direction={invoice.direction} />
              </InfoRow>
              <InfoRow labelKey="invoice.counterparty">
                <span className="text-sm text-foreground">
                  {invoice.counterpartyName}
                </span>
              </InfoRow>
              {invoice.counterpartyVkn && (
                <InfoRow labelKey="invoice.vkn">
                  <span className="tabular-numstext-sm text-muted-foreground">
                    {maskVkn(invoice.counterpartyVkn)}
                  </span>
                </InfoRow>
              )}
              <InfoRow labelKey="common.status">
                <StatusBadge status={invoice.status} />
              </InfoRow>
            </dl>
          </div>

          {/* KDV Özeti */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t("invoice.vatSummary")}
            </h2>
            <div className="space-y-2">
              {vatGroups.map((group) => (
                <div key={group.rate} className="text-xs space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      %{group.rate} {t("invoice.vatBase")}
                    </span>
                    <span className="num">
                      {formatCurrency(kurusToTl(group.baseKurus))}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pl-2">
                    <span>
                      {t("invoice.kdv")} (%{group.rate})
                    </span>
                    <span className="num">
                      {formatCurrency(kurusToTl(group.vatKurus))}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border text-sm font-semibold">
                <span className="text-foreground">{t("invoice.total_kdv")}</span>
                <span className="tabular-numstext-primary">
                  {formatCurrency(kurusToTl(invoice.vatTotalKurus))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
        </TabsContent>

        {/* Tab 2: Eşleştirme (Matching) */}
        {showMatchingTab && (
          <TabsContent value="matching" className="space-y-5">
            <MatchingPanel invoice={invoice} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

interface FaturaNotFoundClientProps {
  title: string;
}

export function FaturaNotFoundClient({ title }: FaturaNotFoundClientProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <Link
        href="/faturalar"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        ← {title}
      </Link>
      <p className="text-sm text-muted-foreground text-center py-10">
        {t("invoice.notFound")}
      </p>
    </div>
  );
}
