import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import FaturaClientPage from "./fatura-client-page";
export type { Fatura } from "./fatura-table";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t("invoice.pageTitle")} — Enkap` };

export default function FaturaPage() {
  return <FaturaClientPage />;
}
