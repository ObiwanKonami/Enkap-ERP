import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { formatCurrency, formatDate, kurusToTl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Phone,
  Mail,
  Users,
  CheckSquare,
  ArrowUpRight,
  ArrowDownLeft,
  MapPin,
  CreditCard,
  Hash,
  Scale,
  Pencil,
  FileText,
} from "lucide-react";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";

export const metadata = { title: "Contact Detail — Enkap" };

const t = createTranslator(DEFAULT_LOCALE);

interface Contact {
  id: string;
  name: string;
  type: "customer" | "vendor" | "both" | "prospect";
  isActive?: boolean;
  city?: string;
  district?: string;
  email?: string;
  phone?: string;
  vkn?: string;
  tckn?: string;
  address?: string;
  iban?: string;
}

interface ContactDetail extends Contact {
  address?: string;
  country?: string;
  iban?: string;
  balance?: number;
}

interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  total: number;
  status:
    | "DRAFT"
    | "PENDING_GIB"
    | "SENT_GIB"
    | "ACCEPTED_GIB"
    | "REJECTED_GIB"
    | "CANCELLED";
  direction: "OUT" | "IN";
}

interface ActivitySummary {
  id: string;
  type: "CALL" | "EMAIL" | "MEETING" | "TASK";
  subject: string;
  scheduledAt: string;
  status: "PLANNED" | "COMPLETED" | "CANCELLED";
}

function invoiceStatusBadge(status: InvoiceSummary["status"]) {
  switch (status) {
    case "ACCEPTED_GIB":
      return { variant: "default" as const, label: t("crm.detail.invoiceStatus.ACCEPTED_GIB") };
    case "SENT_GIB":
    case "PENDING_GIB":
      return { variant: "secondary" as const, label: t("crm.detail.invoiceStatus.SENT_GIB") };
    case "REJECTED_GIB":
      return { variant: "destructive" as const, label: t("crm.detail.invoiceStatus.REJECTED_GIB") };
    case "DRAFT":
    case "CANCELLED":
      return { variant: "outline" as const, label: t(`crm.detail.invoiceStatus.${status}` as "crm.detail.invoiceStatus.DRAFT") };
  }
}

function activityStatusBadge(status: ActivitySummary["status"]) {
  switch (status) {
    case "COMPLETED":
      return { variant: "default" as const, label: t("crm.detail.activityStatus.COMPLETED") };
    case "PLANNED":
      return { variant: "secondary" as const, label: t("crm.detail.activityStatus.PLANNED") };
    case "CANCELLED":
      return { variant: "outline" as const, label: t("crm.detail.activityStatus.CANCELLED") };
  }
}

function ActivityTypeIcon({ type }: { type: ActivitySummary["type"] }) {
  const cls = "shrink-0 text-muted-foreground";
  switch (type) {
    case "CALL":
      return <Phone size={14} className={cls} />;
    case "EMAIL":
      return <Mail size={14} className={cls} />;
    case "MEETING":
      return <Users size={14} className={cls} />;
    case "TASK":
      return <CheckSquare size={14} className={cls} />;
  }
}

function typeBadgeVariant(type: Contact["type"]): "default" | "secondary" | "destructive" | "outline" {
  switch (type) {
    case "customer":
      return "default";
    case "vendor":
      return "destructive";
    case "both":
      return "secondary";
    case "prospect":
      return "outline";
  }
}

function typeBadgeLabel(type: Contact["type"]): string {
  return t(`crm.detail.typeBadge.${type.toUpperCase()}` as "crm.detail.typeBadge.CUSTOMER");
}

function maskVkn(vkn: string): string {
  return `${vkn.slice(0, 6)}****`;
}

export default async function MusteriDetayPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const token = session?.user.accessToken ?? "";

  const [contact, invoiceRes] = await Promise.all([
    serverFetch<ContactDetail>("crm", `/contacts/${params.id}`, token).catch(
      () => null,
    ),
    serverFetch<{ items: InvoiceSummary[]; total: number } | InvoiceSummary[]>(
      "financial",
      `/invoices?counterpartyId=${params.id}&limit=10`,
      token,
    ).catch(() => ({ items: [] as InvoiceSummary[], total: 0 })),
  ]);

  const invoices: InvoiceSummary[] = Array.isArray(invoiceRes)
    ? invoiceRes
    : ((invoiceRes as { items?: InvoiceSummary[]; data?: InvoiceSummary[] })
        .items ??
      (invoiceRes as { items?: InvoiceSummary[]; data?: InvoiceSummary[] })
        .data ??
      []);

  if (!contact) {
    return (
      <div className="flex flex-col gap-5">
        <Link
          href="/musteri"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {t("crm.detail.contacts")}
        </Link>
        <p className="text-sm text-muted-foreground text-center py-10">
          {t("crm.detail.contactNotFound")}
        </p>
      </div>
    );
  }

  const balanceTl = kurusToTl(contact.balance ?? 0);
  const isAlacak = balanceTl >= 0;
  const taxId = contact.vkn ?? contact.tckn;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Link
          href="/musteri"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {t("crm.detail.contacts")}
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
            <Link href={`/musteri/${params.id}/mutabakat`}>
              <Scale size={13} />
              {t("crm.detail.reconciliationStatement")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
            <Link href={`/faturalar/yeni?contactId=${contact.id}&contactName=${encodeURIComponent(contact.name)}`}>
              <FileText size={13} />
              {t("crm.detail.newInvoice")}
            </Link>
          </Button>
          <Button size="sm" className="h-8 gap-1.5" asChild>
            <Link href={`/musteri/${params.id}/duzenle`}>
              <Pencil size={13} />
              {t("common.edit")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
            {contact.name}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={typeBadgeVariant(contact.type)}>
              {typeBadgeLabel(contact.type)}
            </Badge>
            {!contact.isActive && (
              <Badge variant="outline">
                {t("hr.status.passive")}
              </Badge>
            )}
            {contact.city && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin size={11} />
                {contact.district ? `${contact.district}, ${contact.city}` : contact.city}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
            isAlacak
              ? "bg-muted border-border"
              : "bg-muted border-border"
          }`}
        >
          <CreditCard size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("crm.detail.openBalance")}
            </p>
            <p className="tabular-nums text-base font-bold text-foreground leading-tight">
              {formatCurrency(Math.abs(balanceTl))}
              <span className="text-[10px] font-normal ml-1 opacity-70">
                {isAlacak ? t("crm.detail.alacak") : t("crm.detail.borc")}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted border-border">
          <Hash size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("crm.detail.totalInvoice")}
            </p>
            <p className="tabular-nums text-base font-bold text-foreground leading-tight">
              {invoices.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted border-border">
          <CheckSquare size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {t("crm.detail.activities")}
            </p>
            <p className="text-xs text-muted-foreground leading-tight">
              {t("crm.detail.listedBelow")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-5 col-span-1">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {t("crm.detail.contactInfo")}
          </h2>
          <dl className="space-y-3 text-sm">
            {taxId && (
              <div className="flex items-start gap-2">
                <Hash size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {contact.vkn ? t("crm.detail.vkn") : t("crm.detail.tckn")}
                  </dt>
                  <dd className="tabular-nums text-muted-foreground mt-0.5">
                    {contact.vkn ? maskVkn(taxId) : taxId}
                  </dd>
                </div>
              </div>
            )}

            {contact.email && (
              <div className="flex items-start gap-2">
                <Mail size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t("crm.detail.email")}
                  </dt>
                  <dd className="mt-0.5">
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-primary hover:text-primary/80 transition-colors truncate block"
                    >
                      {contact.email}
                    </a>
                  </dd>
                </div>
              </div>
            )}

            {contact.phone && (
              <div className="flex items-start gap-2">
                <Phone size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t("crm.detail.phone")}
                  </dt>
                  <dd className="tabular-nums text-muted-foreground mt-0.5">{contact.phone}</dd>
                </div>
              </div>
            )}

            {(contact.city || contact.district) && (
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t("crm.detail.city")}
                  </dt>
                  <dd className="text-muted-foreground mt-0.5">
                    {[contact.district, contact.city].filter(Boolean).join(', ')}
                  </dd>
                </div>
              </div>
            )}

            {contact.address && (
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t("crm.detail.address")}
                  </dt>
                  <dd className="text-muted-foreground mt-0.5 leading-snug">
                    {contact.address}
                  </dd>
                </div>
              </div>
            )}

            {contact.iban && (
              <div className="flex items-start gap-2">
                <CreditCard size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <dt className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t("crm.detail.iban")}
                  </dt>
                  <dd className="tabular-nums text-muted-foreground mt-0.5 text-xs">
                    {contact.iban.slice(0, 4)}
                    {"*".repeat(contact.iban.length - 8)}
                    {contact.iban.slice(-4)}
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </Card>

        <Card className="p-5 col-span-1 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {t("crm.detail.invoices")}
          </h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("crm.detail.noInvoicesFound")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-[10px] text-muted-foreground uppercase tracking-wider font-medium pb-2 pr-3">
                      {t("crm.detail.invoiceNumber")}
                    </th>
                    <th className="text-left text-[10px] text-muted-foreground uppercase tracking-wider font-medium pb-2 pr-3">
                      {t("crm.detail.date")}
                    </th>
                    <th className="text-right text-[10px] text-muted-foreground uppercase tracking-wider font-medium pb-2 pr-3">
                      {t("crm.detail.amount")}
                    </th>
                    <th className="text-center text-[10px] text-muted-foreground uppercase tracking-wider font-medium pb-2 pr-3">
                      {t("crm.detail.direction")}
                    </th>
                    <th className="text-left text-[10px] text-muted-foreground uppercase tracking-wider font-medium pb-2">
                      {t("crm.detail.status")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => {
                    const status = invoiceStatusBadge(inv.status);
                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/faturalar/${inv.id}`}
                            className="tabular-nums text-primary hover:text-primary/80 transition-colors text-xs"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-foreground text-xs whitespace-nowrap">
                          {formatCurrency(kurusToTl(Number(inv.total)))}
                        </td>
                        <td className="py-2.5 pr-3 text-center">
                          {inv.direction === "OUT" ? (
                            <ArrowUpRight
                              size={14}
                              className="text-muted-foreground inline"
                              aria-label={t("crm.detail.outgoing")}
                            />
                          ) : (
                            <ArrowDownLeft
                              size={14}
                              className="text-muted-foreground inline"
                              aria-label={t("crm.detail.incoming")}
                            />
                          )}
                        </td>
                        <td className="py-2.5">
                          <Badge variant={status.variant} className="text-[10px]">
                            {status.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <MusteriAktiviteleri contactId={contact.id} contactName={contact.name} />
    </div>
  );
}

function MusteriAktiviteleri({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">
        {t("crm.detail.activities")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("crm.detail.listedBelow")}</p>
    </Card>
  );
}
