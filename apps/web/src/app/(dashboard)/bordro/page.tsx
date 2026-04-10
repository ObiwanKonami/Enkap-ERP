import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { BordroClientPage } from "./bordro-client-page";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import type { BordroRow } from "./bordro-table";

const t = createTranslator(DEFAULT_LOCALE);

export async function generateMetadata() {
  return { title: `${t("hr.payrollManagement")} — Enkap` };
}

async function fetchPayroll(
  year: number,
  month: number,
  token: string,
): Promise<BordroRow[]> {
  const raw = await serverFetch<Record<string, unknown>[]>("hr", `/payroll/${year}/${month}`, token)
    .catch(() => []);
  
  return raw.map((p) => ({
    id: p.id as string,
    employeeId: p.employeeId as string,
    employeeName: p.employeeName as string,
    grossSalaryKurus: (p.grossSalaryKurus ?? p.grossSalary ?? 0) as number,
    netSalaryKurus: (p.netSalaryKurus ?? p.netSalary ?? 0) as number,
    sgkEmployeeKurus: (p.sgkEmployeeKurus ?? p.sgkEmployee ?? 0) as number,
    sgkEmployerKurus: (p.sgkEmployerKurus ?? p.sgkEmployer ?? 0) as number,
    incomeTaxKurus: (p.incomeTaxKurus ?? p.incomeTax ?? 0) as number,
    stampTaxKurus: (p.stampTaxKurus ?? p.stampTax ?? 0) as number,
    status: p.isApproved ? 'APPROVED' : 'PENDING',
    year: p.year as number,
    month: p.month as number,
  }));
}

export default async function BordroPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const now = new Date();
  const year = parseInt(searchParams.year ?? String(now.getFullYear()), 10);
  const month = parseInt(searchParams.month ?? String(now.getMonth() + 1), 10);

  const session = await getServerSession(authOptions);
  const initialData = await fetchPayroll(
    year,
    month,
    session?.user.accessToken ?? "",
  );

  return <BordroClientPage initialData={initialData} initialYear={year} initialMonth={month} />;
}
