import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { FaturaDetayClient, FaturaNotFoundClient } from "./fatura-detay-client";

const t = createTranslator(DEFAULT_LOCALE);

// ─── Tip tanımları ───────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number; // kuruş
  vatRate: number; // % (0, 10, 20)
  lineTotal: number; // kuruş (quantity * unitPrice)
  vatAmount: number; // kuruş
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  issueDate: string; // ISO 8601
  dueDate?: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE" | "CANCELLED";
  direction: "OUTGOING" | "INCOMING";
  type?: "TICARIFATURA" | "E_ARSIV" | "KDV_EXEMPT";
  vendorId?: string;
  counterpartyName: string;
  counterpartyVkn?: string;
  subtotalKurus: number;
  vatTotalKurus: number;
  totalKurus: number;
  items: InvoiceItem[];
  notes?: string;
}

// ─── Veri yükleme ────────────────────────────────────────────────────────────

async function fetchInvoice(
  id: string,
  token: string,
): Promise<InvoiceDetail | null> {
  type RawLine = {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    kdvRate: number;
    kdvAmount: number;
    lineTotal: number;
  };
  type RawInvoice = {
    id: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate?: string;
    status: string;
    direction: string;
    type?: string;
    customerId?: string;
    vendorId?: string;
    counterpartyName?: string;
    counterpartyVkn?: string;
    subtotal: number;
    kdvTotal: number;
    total: number;
    lines?: RawLine[];
    notes?: string;
  };

  return serverFetch<RawInvoice>("financial", `/invoices/${id}`, token)
    .then(
      (r): InvoiceDetail => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        issueDate: r.issueDate,
        dueDate: r.dueDate || undefined,
        status: (r.status === "ACCEPTED_GIB" || r.status === "SENT_GIB"
          ? "ISSUED"
          : r.status === "PENDING_GIB"
            ? "ISSUED"
            : r.status) as InvoiceDetail["status"],
        direction: r.direction === "OUT" ? "OUTGOING" : "INCOMING",
        type: (r.type === "TICARIFATURA" || r.type === "E_ARSIV" || r.type === "KDV_EXEMPT") ? r.type : undefined,
        vendorId: r.vendorId,
        counterpartyName: r.counterpartyName ?? "—",
        counterpartyVkn: r.counterpartyVkn,
        subtotalKurus: Number(r.subtotal),
        vatTotalKurus: Number(r.kdvTotal),
        totalKurus: Number(r.total),
        notes: r.notes,
        items: (r.lines ?? []).map((l) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          vatRate: Number(l.kdvRate),
          lineTotal: Number(l.lineTotal),
          vatAmount: Number(l.kdvAmount),
        })),
      }),
    )
    .catch(() => null);
}

// ─── Sayfa bileşeni ──────────────────────────────────────────────────────────

export default async function FaturaDetayPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const invoice = await fetchInvoice(
    params.id,
    session?.user.accessToken ?? "",
  );

  if (!invoice) {
    return <FaturaNotFoundClient title={t('invoice.pageTitle')} />;
  }

  return <FaturaDetayClient invoice={invoice} />;
}
