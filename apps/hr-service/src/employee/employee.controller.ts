import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan, Auditable } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { EmployeeService, type CreateEmployeeDto } from './employee.service';
import type { EmployeeStatus } from './entities/employee.entity';

@ApiTags('employees')
@ApiBearerAuth('JWT')
@Controller('employees')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  /** POST /employees */
  @ApiOperation({ summary: 'Yeni çalışan oluştur' })
  @ApiResponse({ status: 201, description: 'Çalışan başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek — zorunlu alanlar eksik veya TCKN hatalı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 409, description: 'Sicil numarası zaten kullanılıyor' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auditable({ action: 'CREATE', resource: 'employee.tckn' })
  create(@Body() dto: CreateEmployeeDto) {
    if (!dto.sicilNo || !dto.name || !dto.surname || !dto.hireDate) {
      throw new BadRequestException(
        'sicilNo, name, surname ve hireDate zorunludur.',
      );
    }
    if (dto.tckn && dto.tckn.length !== 11) {
      throw new BadRequestException('TCKN 11 hane olmalıdır.');
    }
    return this.employeeService.create(dto);
  }

  /** GET /employees?status=active&page=1&limit=50 */
  @ApiOperation({ summary: 'Çalışan listesi' })
  @ApiQuery({ name: 'status', required: false, description: 'Çalışan durumu filtresi (active, passive, terminated)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Ad veya soyad araması' })
  @ApiQuery({ name: 'department', required: false, type: String, description: 'Departman filtresi' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt sayısı (varsayılan: 50, max: 200)' })
  @ApiResponse({ status: 200, description: 'Çalışan listesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('page')   page   = '1',
    @Query('limit')  limit  = '50',
  ) {
    return this.employeeService.findAll({
      status: status as EmployeeStatus | undefined,
      search,
      department,
      page:   parseInt(page, 10),
      limit:  parseInt(limit, 10),
    });
  }

  /** GET /employees/:id */
  @ApiOperation({ summary: 'Çalışan detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiResponse({ status: 200, description: 'Çalışan bilgileri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Get(':id')
  @Auditable({ action: 'READ', resource: 'employee.tckn' })
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

  /** PATCH /employees/:id */
  @ApiOperation({ summary: 'Çalışan bilgilerini güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiResponse({ status: 200, description: 'Çalışan başarıyla güncellendi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Patch(':id')
  @Auditable({ action: 'UPDATE', resource: 'employee.tckn' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateEmployeeDto>) {
    return this.employeeService.update(id, dto);
  }

  /** POST /employees/:id/fleet-sync — Manuel fleet senkronizasyon */
  @ApiOperation({ summary: 'Sürücü çalışanı fleet-service ile manuel senkronize et' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiResponse({ status: 200, description: 'Senkronizasyon tetiklendi' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Post(':id/fleet-sync')
  @HttpCode(HttpStatus.OK)
  triggerFleetSync(@Param('id') id: string) {
    return this.employeeService.triggerFleetSync(id);
  }

  /** DELETE /employees/:id — İşten çıkış */
  @ApiOperation({ summary: 'Çalışanı işten çıkar (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiBody({ schema: { type: 'object', properties: { terminationDate: { type: 'string', example: '2026-03-19', description: 'İşten çıkış tarihi (ISO 8601)' } }, required: ['terminationDate'] } })
  @ApiResponse({ status: 204, description: 'Çalışan başarıyla işten çıkarıldı' })
  @ApiResponse({ status: 400, description: 'terminationDate zorunludur' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  terminate(
    @Param('id') id: string,
    @Body('terminationDate') terminationDate: string,
  ) {
    if (!terminationDate) {
      throw new BadRequestException('terminationDate zorunludur.');
    }
    return this.employeeService.terminate(id, terminationDate);
  }
}
