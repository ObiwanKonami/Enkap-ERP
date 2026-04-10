import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import SiparisClientPage from "./siparis-client-page";
import type { SiparisRow } from "./siparis-table";

const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: `${t("order.title")} — Enkap` };

export type { SiparisRow };

export default function SiparisPage() {
  return <SiparisClientPage />;
}
