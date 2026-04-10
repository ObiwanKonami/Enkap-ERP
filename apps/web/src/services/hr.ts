/**
 * HR Service — Çalışan, Bordro, İzin, SGK
 * Port: 3007 | Proxy: /api/hr/*
 */
import { apiClient } from '@/lib/api-client';
import type { LeaveType, LeaveStatus } from '@enkap/shared-types';

export type { LeaveType, LeaveStatus };

export type EmploymentStatus = 'ACTIVE' | 'TERMINATED' | 'ON_LEAVE';

export type LicenseClass = 'B' | 'C' | 'CE' | 'D' | 'DE';

export interface Employee {
  id:               string;
  sicilNo?:         string;
  firstName:        string;
  lastName:         string;
  tckn:             string;
  email?:           string;
  phone?:           string;
  department?:      string;
  title?:           string;
  startDate:        string;
  endDate?:         string;
  status:           EmploymentStatus;
  baseSalaryKurus:  number;
  /** Ehliyet bilgisi — dolu ise çalışan aynı zamanda fleet sürücüsüdür */
  licenseClass?:    LicenseClass;
  licenseNumber?:   string;
  licenseExpires?:  string;
}

export interface PayrollEntry {
  id:              string;
  employeeId:      string;
  employeeName:    string;
  year:            number;
  month:           number;
  grossSalary:     number;
  netSalary:       number;
  sgkEmployee:     number;
  sgkEmployer:     number;
  incomeTax:       number;
  stampTax:        number;
  isApproved:      boolean;
}

export interface LeaveRequest {
  id:           string;
  employeeId:   string;
  employeeName: string;
  leaveType:    LeaveType;
  startDate:    string;
  endDate:      string;
  days:         number;
  status:       LeaveStatus;
  reason?:      string;
}

export interface LeaveBalance {
  employeeId:  string;
  annual:      number;
  used:        number;
  remaining:   number;
}

// Backend → Frontend alan adı normalizasyonu
function normalizeEmployee(raw: Record<string, unknown>): Employee {
  const statusMap: Record<string, EmploymentStatus> = {
    active:     'ACTIVE',
    on_leave:   'ON_LEAVE',
    terminated: 'TERMINATED',
  };
  return {
    id:              raw.id as string,
    sicilNo:         raw.sicilNo as string | undefined,
    firstName:       (raw.name ?? raw.firstName) as string,
    lastName:        (raw.surname ?? raw.lastName) as string,
    tckn:            (raw.tckn as string) ?? '',
    email:           raw.email as string | undefined,
    phone:           raw.phone as string | undefined,
    department:      raw.department as string | undefined,
    title:           raw.title as string | undefined,
    startDate:       (raw.hireDate ?? raw.startDate) as string,
    endDate:         (raw.terminationDate ?? raw.endDate) as string | undefined,
    status:          (statusMap[raw.status as string] ?? raw.status) as EmploymentStatus,
    baseSalaryKurus: (raw.grossSalaryKurus ?? raw.baseSalaryKurus) as number,
    licenseClass:    raw.licenseClass as LicenseClass | undefined,
    licenseNumber:   raw.licenseNumber as string | undefined,
    licenseExpires:  raw.licenseExpires as string | undefined,
  };
}

// Frontend → Backend alan adı dönüşümü
function toBackendEmployee(data: Partial<Employee> & { sicilNo?: string; grossSalaryKurus?: number }): Record<string, unknown> {
  return {
    sicilNo:          data.sicilNo,
    name:             data.firstName,
    surname:          data.lastName,
    tckn:             data.tckn,
    email:            data.email,
    phone:            data.phone,
    department:       data.department,
    title:            data.title,
    hireDate:         data.startDate,
    grossSalaryKurus: data.grossSalaryKurus ?? data.baseSalaryKurus,
    licenseClass:     data.licenseClass,
    licenseNumber:    data.licenseNumber,
    licenseExpires:   data.licenseExpires,
  };
}

export const hrApi = {

  employees: {
    list: (params?: { status?: EmploymentStatus; search?: string; department?: string; limit?: number; page?: number; offset?: number }) =>
      apiClient
        .get<{ data: Record<string, unknown>[]; total: number }>('/hr/employees', { params })
        .then(r => ({
          ...r,
          data: { data: (r.data.data ?? []).map(normalizeEmployee), total: r.data.total },
        })),

    get: (id: string) =>
      apiClient
        .get<Record<string, unknown>>(`/hr/employees/${id}`)
        .then(r => ({ ...r, data: normalizeEmployee(r.data) })),

    create: (data: Partial<Employee> & { sicilNo?: string; grossSalaryKurus?: number }) =>
      apiClient
        .post<Record<string, unknown>>('/hr/employees', toBackendEmployee(data))
        .then(r => ({ ...r, data: normalizeEmployee(r.data) })),

    update: (id: string, data: Partial<Employee> & { grossSalaryKurus?: number }) =>
      apiClient
        .patch<Record<string, unknown>>(`/hr/employees/${id}`, toBackendEmployee(data))
        .then(r => ({ ...r, data: normalizeEmployee(r.data) })),

    terminate: (id: string, terminationDate: string) =>
      apiClient.delete(`/hr/employees/${id}`, { data: { terminationDate } }),
  },

  payroll: {
    get: (year: number, month: number) =>
      apiClient.get<PayrollEntry[]>(`/hr/payroll/${year}/${month}`),

    calculate: (year: number, month: number) =>
      apiClient.post<PayrollEntry[]>(`/hr/payroll/${year}/${month}/calculate`, {}),

    approve: (year: number, month: number) =>
      apiClient.post(`/hr/payroll/${year}/${month}/approve`, {}),

    slip: (employeeId: string, year: number, month: number) =>
      apiClient.get(`/hr/payroll/${employeeId}/${year}/${month}/slip`, { responseType: 'blob' }),

    sendSlips: (year: number, month: number) =>
      apiClient.post(`/hr/payroll/${year}/${month}/send-payslips`, {}),

    byEmployee: (employeeId: string) =>
      apiClient.get<PayrollEntry[]>(`/hr/payroll/employee/${employeeId}`),
  },

  leave: {
    pending: (params?: { page?: number; limit?: number }) =>
      apiClient.get<{ items: LeaveRequest[]; total: number; page: number; limit: number }>('/hr/leave/requests/pending', { params }),

    byEmployee: (employeeId: string) =>
      apiClient.get<LeaveRequest[]>(`/hr/leave/requests/employee/${employeeId}`),

    create: (data: { employeeId: string; leaveType: LeaveType; startDate: string; endDate: string; notes?: string; medicalReportNo?: string }) =>
      apiClient.post<LeaveRequest>('/hr/leave/requests', {
        employeeId:      data.employeeId,
        leaveType:       data.leaveType,
        startDate:       data.startDate,
        endDate:         data.endDate,
        notes:           data.notes,
        medicalReportNo: data.medicalReportNo,
      }),

    approve: (id: string, data: { approved: boolean; notes?: string }) =>
      apiClient.patch<LeaveRequest>(`/hr/leave/requests/${id}/approve`, data),

    balance: (employeeId: string) =>
      apiClient.get<LeaveBalance>(`/hr/leave/balance/${employeeId}`),
  },

  sgk: {
    bildirge: (year: number, month: number) =>
      apiClient.get(`/hr/sgk/${year}/${month}/bildirge`),

    bildirgeXml: (year: number, month: number) =>
      apiClient.get(`/hr/sgk/${year}/${month}/bildirge/xml`, { responseType: 'blob' }),
  },
};

// ─── Yasal Parametreler API'si ───────────────────────────────────────────────

export interface FiscalParamsDto {
  minWageKurus:         number;
  sgkCeilingKurus:      number;
  sgkWorkerRate:        number;
  unemploymentWorker:   number;
  sgkEmployerRate:      number;
  unemploymentEmployer: number;
  stampTaxRate:         number;
  gvBrackets:           Array<{ limitKurus: number; rate: number }>;
  disabilityDeductions: { 1: number; 2: number; 3: number };
}

export interface FiscalParamsResponse extends FiscalParamsDto {
  year: number;
}

export const fiscalParamsApi = {
  get: (year: number) =>
    apiClient.get<FiscalParamsResponse>(`/hr/payroll/fiscal-params/${year}`),

  update: (year: number, dto: FiscalParamsDto) =>
    apiClient.put<FiscalParamsResponse>(`/hr/payroll/fiscal-params/${year}`, dto),
};
