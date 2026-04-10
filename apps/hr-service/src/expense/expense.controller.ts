import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
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
import {
  TenantGuard,
  RolesGuard,
  Roles,
  FeatureGateGuard,
  RequiresPlan,
  getTenantContext,
} from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { ExpenseService, FindExpensesParams } from './expense.service';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import type { ExpenseStatus } from './entities/expense-report.entity';

/**
 * Masraf Yönetimi Controller.
 *
 * İş akışı:
 *   POST /expenses          → Taslak rapor oluştur
 *   POST /expenses/:id/submit   → Onaya gönder
 *   POST /expenses/:id/approve  → Onayla (yönetici)
 *   POST /expenses/:id/reject   → Reddet (yönetici)
 *   POST /expenses/:id/pay      → Ödendi işaretle (muhasebe)
 *
 * Tüm endpoint'ler:
 *  - TenantGuard      → tenant izolasyonu
 *  - RolesGuard       → rol kontrolü
 *  - FeatureGateGuard → HR modülü plan kontrolü
 */
@ApiTags('expenses')
@ApiBearerAuth('JWT')
@Controller('expenses')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  /**
   * POST /api/v1/expenses
   * Yeni masraf raporu oluşturur (TASLAK durumunda).
   */
  @ApiOperation({ summary: 'Yeni masraf raporu oluştur' })
  @ApiResponse({ status: 201, description: 'Masraf raporu başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek — zorunlu alanlar eksik veya hatalı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateExpenseReportDto) {
    const { userId } = getTenantContext();
    return this.expenseService.create(dto, userId);
  }

  /**
   * GET /api/v1/expenses
   * Masraf raporlarını listeler.
   * İsteğe bağlı filtreler: employeeId, status, period.
   */
  @ApiOperation({ summary: 'Masraf raporlarını listele' })
  @ApiQuery({ name: 'employeeId', required: false, type: String, description: 'Çalışan UUID filtresi' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['TASLAK', 'ONAY_BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI', 'ODENDI'],
    description: 'Durum filtresi',
  })
  @ApiQuery({ name: 'period', required: false, type: String, description: 'Dönem filtresi (YYYY-MM)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt (varsayılan: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Atlanacak kayıt sayısı (varsayılan: 0)' })
  @ApiResponse({ status: 200, description: 'Masraf raporu listesi döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('status')     status?: string,
    @Query('period')     period?: string,
    @Query('limit',  new DefaultValuePipe(50),  ParseIntPipe) limit  = 50,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset = 0,
  ) {
    const params: FindExpensesParams = {
      employeeId,
      status: status as ExpenseStatus | undefined,
      period,
      limit,
      offset,
    };
    return this.expenseService.findAll(params);
  }

  /**
   * GET /api/v1/expenses/:id
   * Masraf raporu detayını getirir.
   */
  @ApiOperation({ summary: 'Masraf raporu detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Masraf raporu UUID' })
  @ApiResponse({ status: 200, description: 'Masraf raporu döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Masraf raporu bulunamadı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findOne(id);
  }

  /**
   * POST /api/v1/expenses/:id/submit
   * Masraf raporunu onaya gönderir (TASLAK → ONAY_BEKLIYOR).
   */
  @ApiOperation({ summary: 'Masraf raporunu onaya gönder' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Masraf raporu UUID' })
  @ApiResponse({ status: 200, description: 'Rapor onaya gönderildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Masraf raporu bulunamadı' })
  @ApiResponse({ status: 409, description: 'Rapor zaten gönderilmiş veya işlenmiş' })
  @Post(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.submit(id);
  }

  /**
   * POST /api/v1/expenses/:id/approve
   * Masraf raporunu onaylar (ONAY_BEKLIYOR → ONAYLANDI).
   * Yalnızca IK_YONETICISI veya SISTEM_ADMIN çağırabilir.
   */
  @ApiOperation({ summary: 'Masraf raporunu onayla (yönetici)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Masraf raporu UUID' })
  @ApiResponse({ status: 200, description: 'Rapor onaylandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Masraf raporu bulunamadı' })
  @ApiResponse({ status: 409, description: 'Rapor onay bekliyor durumunda değil' })
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    const { userId: approverId } = getTenantContext();
    return this.expenseService.approve(id, approverId);
  }

  /**
   * POST /api/v1/expenses/:id/reject
   * Masraf raporunu reddeder (ONAY_BEKLIYOR → REDDEDILDI).
   * Red gerekçesi body'de zorunlu olarak gönderilmelidir.
   */
  @ApiOperation({ summary: 'Masraf raporunu reddet (yönetici)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Masraf raporu UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'Makbuz eksik veya okunamaz nitelikte.',
          description: 'Red gerekçesi (zorunlu)',
        },
      },
      required: ['reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'Rapor reddedildi' })
  @ApiResponse({ status: 400, description: 'Red gerekçesi zorunludur' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Masraf raporu bulunamadı' })
  @ApiResponse({ status: 409, description: 'Rapor onay bekliyor durumunda değil' })
  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Red gerekçesi (reason) zorunludur.');
    }
    const { userId: approverId } = getTenantContext();
    return this.expenseService.reject(id, approverId, reason.trim());
  }

  /**
   * POST /api/v1/expenses/:id/pay
   * Masraf raporunu ödendi olarak işaretler (ONAYLANDI → ODENDI).
   * Muhasebe departmanı bu işlemi gerçekleştirir.
   */
  @ApiOperation({ summary: 'Masraf raporunu ödendi işaretle (muhasebe)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Masraf raporu UUID' })
  @ApiResponse({ status: 200, description: 'Rapor ödendi olarak işaretlendi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Masraf raporu bulunamadı' })
  @ApiResponse({ status: 409, description: 'Rapor onaylanmış durumda değil' })
  @Post(':id/pay')
  markPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.markPaid(id);
  }
}
