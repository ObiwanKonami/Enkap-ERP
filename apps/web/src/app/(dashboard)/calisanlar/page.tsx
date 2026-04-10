import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { CalisanClientPage } from "./calisanlar-client-page";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";

const t = createTranslator(DEFAULT_LOCALE);

export async function generateMetadata() {
  return { title: `${t("hr.employeeManagement")} — Enkap` };
}

type RawResponse = {
  items?: Record<string, unknown>[];
  data?: Record<string, unknown>[];
  total: number;
};

const STATUS_MAP: Record<string, string> = {
  active: "ACTIVE",
  on_leave: "ON_LEAVE",
  terminated: "TERMINATED",
};

function normalizeEmployee(raw: Record<string, unknown>) {
  return {
    id: raw.id as string,
    sicilNo: raw.sicilNo as string | undefined,
    firstName: (raw.name ?? raw.firstName) as string,
    lastName: (raw.surname ?? raw.lastName) as string,
    tckn: (raw.tckn ?? "") as string,
    department: (raw.department ?? "") as string,
    title: (raw.title ?? "") as string,
    startDate: (raw.hireDate ?? raw.startDate) as string,
    baseSalaryKurus: (raw.grossSalaryKurus ?? raw.baseSalaryKurus ?? 0) as number,
    status: (STATUS_MAP[raw.status as string] ?? raw.status) as "ACTIVE" | "ON_LEAVE" | "TERMINATED",
  };
}

async function fetchEmployees(
  accessToken: string,
): Promise<{ data: unknown[]; total: number }> {
  return serverFetch<RawResponse>("hr", "/employees?limit=20", accessToken)
    .then((raw) => ({
      data: (raw.items ?? raw.data ?? []).map(normalizeEmployee),
      total: raw.total ?? 0,
    }))
    .catch(() => ({ data: [], total: 0 }));
}

export default async function CalisanlarPage() {
  const session = await getServerSession(authOptions);
  const { data: initialData, total } = await fetchEmployees(
    session?.user.accessToken ?? "",
  );

  return <CalisanClientPage initialData={{ data: initialData as never[], total }} />;
}
