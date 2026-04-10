import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import SatinAlmaClientPage from "./satin-alma-client-page";

const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: `${t("purchase.title")} — Enkap` };

export default function SatinAlmaPage() {
  return <SatinAlmaClientPage />;
}
