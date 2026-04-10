import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { BilancoClient } from "./bilanco-client";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t('accounting.balanceSheetTitle')} — Enkap` };

interface BilancoAccount {
  code: string;
  name: string;
  amount: number;
}

interface BilancoGroup {
  group: string;
  total: number;
  accounts: BilancoAccount[];
}

interface BilancoResponse {
  aktif: BilancoGroup[];
  pasif: BilancoGroup[];
  toplamAktif: number;
  toplamPasif: number;
}

async function fetchBilanco(token: string): Promise<BilancoResponse> {
  return serverFetch<BilancoResponse>(
    "financial",
    "/accounts/bilanco",
    token,
  ).catch(() => ({ aktif: [], pasif: [], toplamAktif: 0, toplamPasif: 0 }));
}

export default async function BilancoPage() {
  const session = await getServerSession(authOptions);
  const data = await fetchBilanco(session?.user.accessToken ?? "");

  return <BilancoClient data={data} />;
}
