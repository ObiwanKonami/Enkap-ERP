import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import KasaBankaClientPage from "./kasa-banka-client-page";

const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: `${t("finance.treasury.title")} — Enkap` };

export default function KasaBankaPage() {
  return <KasaBankaClientPage />;
}
