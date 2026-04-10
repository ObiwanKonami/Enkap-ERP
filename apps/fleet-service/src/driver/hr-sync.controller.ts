import {
  Controller, Post, Patch, Body,
  UnauthorizedException, Headers, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsUUID, IsOptional, IsDateString, MaxLength,
} from 'class-validator';
import { DriverService } from './driver.service';

class HrSyncUpsertDto {
  @IsUUID()   tenantId!:       string;
  @IsUUID()   employeeId!:     string;
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!:  string;
  @IsString() @MaxLength(5)   licenseClass!: string;

  @IsOptional() @IsString() @MaxLength(20)  phone?:          string;
  @IsOptional() @IsString() @MaxLength(50)  licenseNumber?:  string;
  @IsOptional() @IsDateString()             licenseExpires?: string;
}

class HrSyncTerminateDto {
  @IsUUID() tenantId!:   string;
  @IsUUID() employeeId!: string;
}

/**
 * HR Servis Senkronizasyon Endpoint'leri
 *
 * TenantGuard kullanılmaz — tenantId body'den gelir.
 * Kimlik doğrulama: x-api-key header (FLEET_API_KEY).
 * Sadece iç servisler tarafından çağrılır.
 */
@ApiTags('HR Senkronizasyon (dahili)')
@ApiHeader({ name: 'x-api-key', required: true, description: 'FLEET_API_KEY' })
@Controller('hr-sync')
export class HrSyncController {
  private readonly logger = new Logger(HrSyncController.name);

  constructor(
    private readonly driverService: DriverService,
    private readonly config: ConfigService,
  ) {}

  private validateApiKey(key: string | undefined): void {
    const expected = this.config.get<string>('FLEET_API_KEY', '');
    if (!expected || key !== expected) {
      throw new UnauthorizedException('Geçersiz API anahtarı.');
    }
  }

  /** Çalışan oluşturuldu → sürücü upsert */
  @Post('drivers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HR: çalışan oluşturuldu → sürücü upsert (dahili)' })
  async upsertDriver(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() dto: HrSyncUpsertDto,
  ) {
    this.validateApiKey(apiKey);
    this.logger.log(`[${dto.tenantId}] HR sync upsert: çalışan ${dto.employeeId}`);
    return this.driverService.upsertFromHr(
      dto.tenantId,
      dto.employeeId,
      dto.firstName,
      dto.lastName,
      dto.licenseClass,
      { phone: dto.phone, licenseNumber: dto.licenseNumber, licenseExpires: dto.licenseExpires },
    );
  }

  /** Çalışan güncellendi → sürücü upsert */
  @Patch('drivers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HR: çalışan güncellendi → sürücü senkronizasyonu (dahili)' })
  async syncUpdateDriver(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() dto: HrSyncUpsertDto,
  ) {
    this.validateApiKey(apiKey);
    this.logger.log(`[${dto.tenantId}] HR sync update: çalışan ${dto.employeeId}`);
    return this.driverService.upsertFromHr(
      dto.tenantId,
      dto.employeeId,
      dto.firstName,
      dto.lastName,
      dto.licenseClass,
      { phone: dto.phone, licenseNumber: dto.licenseNumber, licenseExpires: dto.licenseExpires },
    );
  }

  /** Çalışan işten çıkarıldı → sürücü PASIF */
  @Patch('drivers/terminate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'HR: çalışan işten çıkarıldı → sürücü pasife alındı (dahili)' })
  async terminateDriver(
    @Headers('x-api-key') apiKey: string | undefined,
    @Body() dto: HrSyncTerminateDto,
  ) {
    this.validateApiKey(apiKey);
    this.logger.log(`[${dto.tenantId}] HR sync terminate: çalışan ${dto.employeeId}`);
    await this.driverService.deactivateByEmployeeId(dto.tenantId, dto.employeeId);
  }
}
