import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { LeaveType, LeaveStatus } from '@enkap/shared-types';

/**
 * İzin Talebi.
 *
 * İş kanunu gereksinimleri:
 *  - Yıllık izin: 4857 Sayılı İş Kanunu Md. 53-60
 *    * 1-5 yıl hizmet: 14 iş günü
 *    * 5-15 yıl: 20 iş günü
 *    * 15+ yıl: 26 iş günü
 *    * 18 yaş altı ve 50 yaş üstü: min 20 iş günü
 *  - Doğum izni: 16 hafta (çoğul gebelik 18 hafta)
 *  - Babalık izni: 5 iş günü
 *
 * Bordro etkisi:
 *  - annual/sick/maternity → ücretli (tam maaş)
 *  - unpaid → bordro günü düşülür, oransal kesinti
 */
@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @Column({ name: 'leave_type', type: 'varchar', length: 30 })
  leaveType!: LeaveType;

  /** İzin başlangıç tarihi (dahil) */
  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  /** İzin bitiş tarihi (dahil) */
  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  /** İş günü sayısı (hafta sonları ve resmi tatiller hariç) */
  @Column({ name: 'working_days', type: 'int' })
  workingDays!: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status!: LeaveStatus;

  /** Onaylayan / Reddeden yönetici user ID */
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Hastalık izni için SGK rapor numarası */
  @Column({ name: 'medical_report_no', type: 'varchar', length: 50, nullable: true })
  medicalReportNo!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
