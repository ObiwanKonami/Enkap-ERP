import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan, getTenantContext, TenantRoutingService } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { PayrollService } from './payroll.service';
import { PayslipBuilderService } from './payslip-builder.service';
import { EmployeeService } from '../employee/employee.service';

@ApiTags('payroll')
@ApiBearerAuth('JWT')
@Controller('payroll')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI, Role.MUHASEBECI)
@RequiresPlan(Feature.HR)
export class PayrollController {
  constructor(
    private readonly payrollService:   PayrollService,
    private readonly payslipBuilder:   PayslipBuilderService,
    private readonly employeeService:  EmployeeService,
    private readonly routingService:   TenantRoutingService,
  ) {}

  /**
   * POST /payroll/:year/:month/calculate
   * Döneme ait bordroyu hesapla ve DRAFT olarak kaydet.
   */
  @ApiOperation({ summary: 'Dönem bordrosunu hesapla ve DRAFT olarak kaydet' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl (2020-2099)' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 201, description: 'Bordrolar başarıyla hesaplandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post(':year/:month/calculate')
  @HttpCode(HttpStatus.CREATED)
  calculate(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    this.validatePeriod(year, month);
    return this.payrollService.calculatePeriod(year, month);
  }

  /**
   * GET /payroll/:year/:month
   * Döneme ait bordro listesini getir.
   */
  @ApiOperation({ summary: 'Döneme ait bordro listesi' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 200, description: 'Bordro listesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get(':year/:month')
  findByPeriod(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.payrollService.findByPeriod(year, month);
  }

  /**
   * POST /payroll/:year/:month/approve
   * Döneme ait tüm DRAFT bordroları onayla.
   */
  @ApiOperation({ summary: 'Dönem bordrolarını onayla (DRAFT → APPROVED)' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 204, description: 'Bordrolar başarıyla onaylandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post(':year/:month/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approve(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    const { userId } = getTenantContext();
    await this.payrollService.approvePeriod(year, month, userId);
  }

  /**
   * GET /payroll/:employeeId/:year/:month/slip
   * Çalışanın bordro pusulasını PDF olarak indir.
   */
  @ApiOperation({ summary: 'Çalışan bordro pusulasını PDF indir' })
  @ApiParam({ name: 'employeeId', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 200, description: 'Bordro pusulası PDF olarak döndürüldü', content: { 'application/pdf': {} } })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan veya bordro bulunamadı' })
  @Get(':employeeId/:year/:month/slip')
  async downloadSlip(
    @Param('employeeId')          employeeId: string,
    @Param('year',  ParseIntPipe) year:       number,
    @Param('month', ParseIntPipe) month:      number,
    @Res()                        reply:      FastifyReply,
  ): Promise<void> {
    const { tenantId } = getTenantContext();

    const [employee, payroll, profile] = await Promise.all([
      this.employeeService.findOne(employeeId),
      this.payrollService.findOne(employeeId, year, month),
      this.routingService.getProfileForDocument(tenantId),
    ]);

    const buffer = await this.payslipBuilder.build(employee, payroll, profile);

    void reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename="bordro-${employee.sicilNo}-${year}-${String(month).padStart(2, '0')}.pdf"`,
      )
      .send(buffer);
  }

  /**
   * POST /payroll/:year/:month/send-payslips
   * Onaylanmış bordrolar için çalışanlara PDF pusulası e-posta ile gönderir.
   */
  @ApiOperation({ summary: 'Onaylanmış bordroları çalışanlara e-posta ile gönder' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 200, description: 'Bordro pusulası e-postaları gönderildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post(':year/:month/send-payslips')
  sendPayslips(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    this.validatePeriod(year, month);
    return this.payrollService.sendPayslips(year, month);
  }

  /** GET /payroll/employee/:employeeId — Çalışanın tüm bordrolarını getir */
  @ApiOperation({ summary: 'Çalışanın tüm bordro geçmişi' })
  @ApiParam({ name: 'employeeId', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiResponse({ status: 200, description: 'Bordro listesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.payrollService.findByEmployee(employeeId);
  }

  private validatePeriod(year: number, month: number): void {
    if (month < 1 || month > 12) {
      throw new Error('Geçersiz ay: 1-12 arası olmalıdır.');
    }
    if (year < 2020 || year > 2099) {
      throw new Error('Geçersiz yıl.');
    }
  }
}
