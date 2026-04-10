import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { formatCurrency, formatDate, kurusToTl } from "@/lib/format";
import { Employee, EmployeeStatus } from "../page";
import Link from "next/link";
import { ChevronLeft, User, Pencil } from "lucide-react";
import { EmployeeDetailClient } from "./employee-detail-client";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Employee Detail — Enkap" };

const t = createTranslator(DEFAULT_LOCALE);

const AY_ADLARI = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(
    new Date(2000, i, 1),
  ),
);

interface EmployeeDetail extends Employee {
  email?: string;
  phone?: string;
  iban?: string;
  leaveBalance: number;
}

export interface PayrollSummary {
  year: number;
  month: number;
  grossSalaryKurus: number;
  netSalaryKurus: number;
  status: "APPROVED" | "PENDING";
}

export interface LeaveBalance {
  leaveType: string;
  total: number;
  used: number;
  remaining: number;
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const map: Record<EmployeeStatus, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    ACTIVE:     { variant: "default", label: t("hr.status.ACTIVE") },
    ON_LEAVE:   { variant: "secondary", label: t("hr.status.ON_LEAVE") },
    TERMINATED: { variant: "destructive", label: t("hr.status.TERMINATED") },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function maskTckn(tckn: string): string {
  return `${tckn.slice(0, 3)}${"*".repeat(6)}${tckn.slice(-2)}`;
}

function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} **** **** **** ${iban.slice(-4)}`;
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd className={mono ? "text-sm text-foreground text-right tabular-nums truncate" : "text-sm text-foreground text-right truncate"}>
        {value}
      </dd>
    </div>
  );
}

function LeaveBalanceRow({ balance }: { balance: LeaveBalance }) {
  const usedPercent = balance.total > 0 ? Math.min((balance.used / balance.total) * 100, 100) : 0;
  const leaveTypeKey = `hr.leaveType.${balance.leaveType}` as "hr.leaveType.ANNUAL";
  const label = t(leaveTypeKey) !== leaveTypeKey ? t(leaveTypeKey) : balance.leaveType;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{balance.remaining}</span> {t("hr.detail.daysLeft").replace("{total}", String(balance.total))}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${usedPercent}%` }} />
      </div>
    </div>
  );
}

export default async function CalisanDetayPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const token = session?.user.accessToken ?? "";

  const STATUS_MAP: Record<string, EmployeeStatus> = {
    active: "ACTIVE",
    on_leave: "ON_LEAVE",
    terminated: "TERMINATED",
  };

  function normalizeEmp(raw: Record<string, unknown>): EmployeeDetail {
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
      status: (STATUS_MAP[raw.status as string] ?? raw.status) as EmployeeStatus,
      email: raw.email as string | undefined,
      phone: raw.phone as string | undefined,
      iban: raw.bankIban as string | undefined,
      leaveBalance: 0,
    };
  }

  const [employee, payrollHistory, leaveBalances] = await Promise.all([
    serverFetch<Record<string, unknown>>("hr", `/employees/${params.id}`, token)
      .then(normalizeEmp)
      .catch(() => null),
    serverFetch<PayrollSummary[]>("hr", `/payroll/employee/${params.id}?limit=6`, token).catch(() => [] as PayrollSummary[]),
    serverFetch<LeaveBalance[]>("hr", `/leave/balance/${params.id}`, token).catch(() => [] as LeaveBalance[]),
  ]);

  if (!employee) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" size="sm" asChild className="w-fit">
          <Link href="/calisanlar">
            <ChevronLeft size={14} />
            {t("hr.detail.employees")}
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground text-center py-10">{t("hr.detail.employeeNotFound")}</p>
      </div>
    );
  }

  const initials = `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/calisanlar">
            <ChevronLeft size={14} />
            {t("hr.detail.employees")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/calisanlar/${params.id}/duzenle`}>
            <Pencil size={13} />
            {t("hr.detail.edit")}
          </Link>
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-base font-bold text-muted-foreground">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {employee.firstName} {employee.lastName}
                </h1>
                <StatusBadge status={employee.status} />
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {employee.title} <span className="mx-1.5">·</span> {employee.department}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                {t("hr.detail.personalInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <InfoRow label={t("hr.detail.tckn")} value={maskTckn(employee.tckn)} />
              {employee.email && <InfoRow label={t("hr.email")} value={employee.email} />}
              {employee.phone && <InfoRow label={t("hr.phone")} value={employee.phone} />}
              {employee.iban && <InfoRow label={t("hr.detail.iban")} value={maskIban(employee.iban)} mono />}
              <InfoRow label={t("hr.detail.startDate")} value={formatDate(employee.startDate)} />
              <div className="flex justify-between items-baseline gap-2 pt-2 border-t border-border">
                <dt className="text-xs text-muted-foreground shrink-0">{t("hr.detail.baseSalary")}</dt>
                <dd className="text-sm font-semibold text-foreground text-right tabular-nums">
                  {formatCurrency(kurusToTl(employee.baseSalaryKurus))}
                </dd>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{t("hr.detail.leaveBalance")}</CardTitle>
            </CardHeader>
            <CardContent>
              {leaveBalances.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("hr.detail.leaveNotFound")}</p>
              ) : (
                <div className="space-y-4">
                  {leaveBalances.map((lb) => (
                    <LeaveBalanceRow key={lb.leaveType} balance={lb} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <EmployeeDetailClient payrollHistory={payrollHistory} ayAdlari={AY_ADLARI} />
        </div>
      </div>
    </div>
  );
}