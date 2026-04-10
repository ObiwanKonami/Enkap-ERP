import {
  IsString,
  IsUUID,
  IsEnum,
  IsNumber,
  IsPositive,
  IsDateString,
  IsOptional,
  Min,
  MaxLength,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ProjectStatus } from '../entities/project.entity';
import type { CostType } from '../entities/project-cost.entity';
import type { TaskStatus } from '../entities/project-task.entity';

const PROJECT_STATUSES: ProjectStatus[] = ['AKTIF', 'BEKLEMEDE', 'TAMAMLANDI', 'IPTAL'];
const COST_TYPES: CostType[] = ['ISGUCU', 'MALZEME', 'GENEL_GIDER', 'SEYAHAT', 'DIGER'];
const TASK_STATUSES: TaskStatus[] = ['YAPILACAK', 'DEVAM', 'TAMAMLANDI', 'IPTAL'];

export class CreateProjectDto {
  @ApiProperty({ example: 'Yeni ERP Entegrasyonu', description: 'Proje adı' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Legacy sistemden geçiş projesi', description: 'Proje açıklaması' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'CRM müşteri UUID\'si' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Acme Yazılım A.Ş.', description: 'Müşteri adı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @ApiPropertyOptional({
    example: 'AKTIF',
    description: 'Proje durumu',
    enum: ['AKTIF', 'BEKLEMEDE', 'TAMAMLANDI', 'IPTAL'],
    default: 'AKTIF',
  })
  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiProperty({ example: '2026-01-01', description: 'Başlangıç tarihi (YYYY-MM-DD)' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Bitiş tarihi (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 50000000,
    description: 'Planlanan bütçe — kuruş (örn: 500.000,00 ₺ = 50000000)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetKurus?: number;

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi (3 hane ISO kodu)', default: 'TRY' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Ek notlar' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Güncellenmiş Proje Adı', description: 'Proje adı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Proje açıklaması' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'CRM müşteri UUID\'si' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: 'Acme Yazılım A.Ş.', description: 'Müşteri adı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @ApiPropertyOptional({
    example: 'BEKLEMEDE',
    description: 'Proje durumu',
    enum: ['AKTIF', 'BEKLEMEDE', 'TAMAMLANDI', 'IPTAL'],
  })
  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ example: '2026-06-01', description: 'Başlangıç tarihi' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Bitiş tarihi' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 75000000, description: 'Revize bütçe — kuruş' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetKurus?: number;

  @ApiPropertyOptional({ description: 'Ek notlar' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddProjectCostDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'Bağlı görev UUID\'si' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiProperty({
    example: 'ISGUCU',
    description: 'Maliyet tipi',
    enum: ['ISGUCU', 'MALZEME', 'GENEL_GIDER', 'SEYAHAT', 'DIGER'],
  })
  @IsEnum(COST_TYPES)
  costType!: CostType;

  @ApiProperty({ example: 'Danışman işçilik ücreti - Mart 2026', description: 'Maliyet açıklaması' })
  @IsString()
  @MaxLength(300)
  description!: string;

  @ApiProperty({ example: '2026-03-31', description: 'Maliyet tarihi (YYYY-MM-DD)' })
  @IsDateString()
  costDate!: string;

  @ApiProperty({ example: 1500000, description: 'Tutar — kuruş (örn: 15.000,00 ₺ = 1500000)' })
  @IsNumber()
  @IsPositive()
  amountKurus!: number;

  @ApiPropertyOptional({ example: 'purchase_order', description: 'Referans kaynak tipi' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ example: 'PO-2026-001', description: 'Referans kaynak ID\'si' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;
}

export class CreateProjectTaskDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'Üst görev UUID\'si (WBS hiyerarşisi için)' })
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @ApiProperty({ example: 'G-001', description: 'Görev kodu' })
  @IsString()
  @MaxLength(50)
  taskCode!: string;

  @ApiProperty({ example: 'Sistem analizi ve tasarım', description: 'Görev adı' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Görev açıklaması' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'YAPILACAK',
    description: 'Görev durumu',
    enum: ['YAPILACAK', 'DEVAM', 'TAMAMLANDI', 'IPTAL'],
    default: 'YAPILACAK',
  })
  @IsOptional()
  @IsEnum(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ example: '2026-01-15', description: 'Planlanan başlangıç tarihi' })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @ApiPropertyOptional({ example: '2026-02-28', description: 'Planlanan bitiş tarihi' })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @ApiPropertyOptional({ example: 80, description: 'Planlanan iş saati' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedHours?: number;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'Atanan çalışan/kullanıcı UUID\'si' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ example: 1, description: 'Sıralama indisi' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateProjectTaskDto {
  @ApiPropertyOptional({ example: 'Güncellenmiş görev adı', description: 'Görev adı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Görev açıklaması' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'DEVAM',
    description: 'Görev durumu',
    enum: ['YAPILACAK', 'DEVAM', 'TAMAMLANDI', 'IPTAL'],
  })
  @IsOptional()
  @IsEnum(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ example: '2026-01-20', description: 'Gerçekleşen başlangıç tarihi' })
  @IsOptional()
  @IsDateString()
  actualStartDate?: string;

  @ApiPropertyOptional({ example: '2026-03-05', description: 'Gerçekleşen bitiş tarihi' })
  @IsOptional()
  @IsDateString()
  actualEndDate?: string;

  @ApiPropertyOptional({ example: 95, description: 'Gerçekleşen iş saati' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualHours?: number;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', description: 'Atanan çalışan/kullanıcı UUID\'si' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}
