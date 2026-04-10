import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import StokClientPage from "./stok-client-page";
export type { StokUrun } from "./stok-table";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t("stock.title")} — Enkap` };

export default function StokPage() {
  return <StokClientPage />;
}
