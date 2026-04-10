import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { MuhasebeClient } from "./muhasebe-client";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t('accounting.pageTitle')} — Enkap` };

export default function MuhasebePage() {
  return <MuhasebeClient />;
}
