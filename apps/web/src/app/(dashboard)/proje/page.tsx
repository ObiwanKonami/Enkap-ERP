import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import ProjeClientPage from "./proje-client-page";

const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: `${t("finance.project.title")} — Enkap` };

export default function ProjePage() {
  return <ProjeClientPage />;
}
