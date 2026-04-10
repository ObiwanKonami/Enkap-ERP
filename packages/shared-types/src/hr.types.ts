/**
 * HR modülüne ait paylaşılan tip tanımları.
 * Backend entity ve frontend servisleri bu tipleri kullanır.
 * Değerler backend veritabanı formatıyla (lowercase) eşleşir.
 */

// ─── İzin Yönetimi ──────────────────────────────────────────────────────────

export type LeaveType =
  | 'annual'         // Yıllık ücretli izin
  | 'sick'           // Hastalık izni (raporlu)
  | 'maternity'      // Doğum izni (SGK ödenek)
  | 'paternity'      // Babalık izni
  | 'unpaid'         // Ücretsiz izin
  | 'administrative'; // İdari izin (cenaze, nikah vb.)

export type LeaveStatus =
  | 'pending'    // Bekliyor
  | 'approved'   // Onaylandı
  | 'rejected'   // Reddedildi
  | 'cancelled'; // İptal edildi

// ─── Çalışan Durumu ──────────────────────────────────────────────────────────

export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

// ─── Avans (Advance) ────────────────────────────────────────────────────────

export type AdvanceStatus =
  | 'PENDING'    // Onay bekliyor
  | 'APPROVED'   // Onaylandı — treasury'e ödeme emri gidecek
  | 'PAID'       // Ödeme yapıldı
  | 'DEDUCTED'   // Bordrodan düşüldü
  | 'REJECTED';  // Reddedildi

export type AdvanceType =
  | 'MAAS_AVANSI'  // Maaş avansı — bordroda otomatik düşülür
  | 'HARCLIK';     // Harçlık / iş avansı — masraf ile kapatılır

// ─── PDKS (Devam Kontrol / Attendance) ──────────────────────────────────────

export type AttendanceType =
  | 'NORMAL'      // Normal mesai
  | 'REMOTE'      // Uzaktan çalışma
  | 'FIELD'       // Saha çalışması
  | 'ABSENT'      // Devamsızlık
  | 'LEAVE';      // İzinli (leave_request referansı ile)

// ─── Fazla Mesai (Overtime) ─────────────────────────────────────────────────

export type OvertimeStatus =
  | 'PENDING'     // Onay bekliyor
  | 'APPROVED'    // Onaylandı — bordroda hesaplanacak
  | 'REJECTED';   // Reddedildi

/** 4857 sayılı İş Kanunu fazla mesai katsayıları */
export type OvertimeMultiplier = 1.5 | 2.0;
// 1.5 → Normal fazla çalışma (%50 zamlı)
// 2.0 → Hafta tatili / Resmi tatil (%100 zamlı)

// ─── Zimmet (Employee Assets) ───────────────────────────────────────────────

export type AssetAssignmentStatus =
  | 'ASSIGNED'    // Zimmetli
  | 'RETURNED'    // İade edildi
  | 'LOST'        // Kayıp
  | 'DAMAGED';    // Hasarlı

// ─── Bordro (Payroll) ───────────────────────────────────────────────────────

export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID';

// ─── İşten Çıkış ───────────────────────────────────────────────────────────

/** SGK İşten Çıkış Kodları (Muhtasar ve Prim Hizmet Beyannamesi) */
export type SgkTerminationCode =
  | '01'  // Deneme süreli iş sözleşmesinin işverence feshi
  | '02'  // Deneme süreli iş sözleşmesinin işçi tarafından feshi
  | '03'  // Belirsiz süreli iş sözleşmesinin işçi tarafından feshi (istifa)
  | '04'  // Belirsiz süreli iş sözleşmesinin işveren tarafından haklı sebep bildirmeksizin feshi
  | '05'  // Belirli süreli iş sözleşmesinin sona ermesi
  | '08'  // Emeklilik (yaşlılık) veya toptan ödeme nedeniyle
  | '09'  // Maluliyet nedeniyle
  | '10'  // Ölüm
  | '11'  // İş kazası sonucu ölüm
  | '12'  // Askerlik
  | '13'  // Kadın işçinin evlenmesi
  | '14'  // Emeklilik için yaş dışında diğer şartların tamamlanması
  | '15'  // Toplu işçi çıkarma
  | '16'  // Sözleşme sona ermeden sigortalının aynı işverene ait diğer işyerine nakli
  | '17'  // İşyerinin kapanması
  | '18'  // İşin sona ermesi
  | '19'  // Mevsim bitimi (iş akdinin askıya alınması)
  | '20'  // Kampanya bitimi (iş akdinin askıya alınması)
  | '22'  // Diğer nedenler
  | '25'  // İşçi tarafından zorunlu nedenle fesih
  | '26'  // Disiplin kurulu kararıyla fesih
  | '27'  // İşveren tarafından zorunlu nedenle fesih
  | '28'  // İşveren tarafından sağlık nedeniyle fesih
  | '29'  // İşveren tarafından ahlak ve iyi niyet kurallarına aykırılık nedeniyle fesih
  | '30'  // Vize süresinin bitimi (belirli süreli)
  | '31'  // Borçlar Kanunu / diğer kanunlar
  | '32'  // 4046 sayılı Kanun gereği özelleştirme nedeniyle fesih
  | '33'  // Gazeteci tarafından sözleşmenin feshi
  | '34'  // İşyerinin devri, işin veya işyerinin niteliğinin değişmesi;

// ─── HR RabbitMQ Event Tipleri ──────────────────────────────────────────────

export interface HrEmployeeHiredEvent {
  tenantId: string;
  employeeId: string;
  sicilNo: string;
  tckn?: string;
  name: string;
  surname: string;
  email?: string;
  phone?: string;
  department?: string;
  title?: string;
  hireDate: string;
  createdBy?: string;
}

export interface HrEmployeeTerminatedEvent {
  tenantId: string;
  employeeId: string;
  sicilNo?: string;
  tckn?: string;
  name?: string;
  surname?: string;
  terminationDate: string;
  sgkTerminationCode: string;
  totalPayoutKurus: number;
  hasOutstandingAssets?: boolean;
  createdBy?: string;
}

export interface HrAdvanceApprovedEvent {
  tenantId: string;
  advanceId: string;
  employeeId: string;
  employeeName?: string;
  amountKurus: number;
  advanceType: string;
  bankIban?: string;
  approvedBy: string;
  approvedAt?: string;
}

export interface HrExpenseApprovedEvent {
  tenantId: string;
  expenseReportId: string;
  employeeId: string;
  employeeName?: string;
  totalKurus: number;
  currency?: string;
  bankIban?: string;
  approvedBy: string;
  approvedAt?: string;
}

export interface HrPayrollFinalizedEvent {
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  employeeCount: number;
  totalGrossKurus: number;
  totalNetKurus: number;
  totalSgkWorkerKurus: number;
  totalSgkEmployerKurus: number;
  totalIncomeTaxKurus: number;
  totalStampTaxKurus: number;
  totalBesKurus: number;
  totalIcraKurus: number;
  totalAdvanceDeductionKurus: number;
  approvedBy: string;
  payrolls: HrPayrollLineItem[];
}

export interface HrPayrollLineItem {
  payrollId: string;
  employeeId: string;
  employeeName: string;
  grossKurus: number;
  netKurus: number;
  sgkWorkerKurus: number;
  sgkEmployerKurus: number;
  unemploymentWorkerKurus: number;
  unemploymentEmployerKurus: number;
  incomeTaxKurus: number;
  stampTaxKurus: number;
  besKurus: number;
  icraKurus: number;
  advanceDeductionKurus: number;
  overtimeKurus: number;
}
