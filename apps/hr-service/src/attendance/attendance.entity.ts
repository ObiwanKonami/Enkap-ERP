import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('attendance_records')
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @Column({ name: 'record_date', type: 'date' })
  recordDate!: string;

  @Column({ name: 'attendance_type', type: 'varchar', length: 20, default: 'NORMAL' })
  attendanceType!: string;

  @Column({ name: 'check_in', type: 'timestamptz', nullable: true })
  checkIn!: Date | null;

  @Column({ name: 'check_out', type: 'timestamptz', nullable: true })
  checkOut!: Date | null;

  @Column({ name: 'worked_minutes', type: 'int', nullable: true })
  workedMinutes!: number | null;

  @Column({ name: 'leave_request_id', type: 'uuid', nullable: true })
  leaveRequestId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
