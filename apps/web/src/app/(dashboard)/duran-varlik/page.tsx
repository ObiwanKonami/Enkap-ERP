import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import DuranVarlikClientPage from "./duran-varlik-client-page";

const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: `${t("finance.fixedAssets.title")} — Enkap` };

export default function DuranVarlikPage() {
  return <DuranVarlikClientPage />;
}
