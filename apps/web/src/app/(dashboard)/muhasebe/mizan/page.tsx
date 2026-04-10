import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { MizanClient } from "./mizan-client";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t('accounting.trialBalanceTitle')} — Enkap` };

interface MizanAccount {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
}

interface MizanResponse {
  accounts: MizanAccount[];
  totalDebit: number;
  totalCredit: number;
}

async function fetchMizan(token: string): Promise<MizanResponse> {
  return serverFetch<MizanResponse>(
    "financial",
    "/accounts/mizan",
    token,
  ).catch(() => ({ accounts: [], totalDebit: 0, totalCredit: 0 }));
}

export default async function MizanPage() {
  const session = await getServerSession(authOptions);
  const data = await fetchMizan(session?.user.accessToken ?? "");

  return <MizanClient data={data} />;
}
