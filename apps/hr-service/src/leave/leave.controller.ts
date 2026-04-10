import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  TenantGuard,
  RolesGuard,
  Roles,
  FeatureGateGuard,
  RequiresPlan,
} from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { LeaveService, CreateLeaveRequestDto, ApproveLeaveDto } from './leave.service';

/**
 * İzin Yönetimi Controller.
 *
 * Tüm endpoint'ler:
 *  - TenantGuard   → tenant izolasyonu
 *  - RolesGuard    → rol kontrolü
 *  - FeatureGateGuard → HR modülü plan kontrolü
 */
@ApiTags('leave')
@ApiBearerAuth('JWT')
@Controller('leave')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  /** İzin talebi oluştur */
  @ApiOperation({ summary: 'Yeni izin talebi oluştur' })
  @ApiResponse({ status: 201, description: 'İzin talebi başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz tarih aralığı veya yetersiz izin bakiyesi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Post('requests')
  create(@Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.createRequest(dto);
  }

  /** Bekleyen izin taleplerini listele (yönetici görünümü) */
  @ApiOperation({ summary: 'Bekleyen izin taleplerini listele (yönetici görünümü)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt (maks 200, varsayılan 50)' })
  @ApiResponse({ status: 200, description: 'Bekleyen izin talepleri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('requests/pending')
  listPending(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leaveService.listPending({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Çalışanın izin taleplerini listele */
  @ApiOperation({ summary: 'Çalışana ait izin taleplerini listele' })
  @ApiParam({ name: 'employeeId', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt (maks 200, varsayılan 50)' })
  @ApiResponse({ status: 200, description: 'İzin talepleri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('requests/employee/:employeeId')
  listForEmployee(
    @Param('employeeId') employeeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leaveService.listForEmployee(employeeId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** İzin talebini onayla veya reddet */
  @ApiOperation({ summary: 'İzin talebini onayla veya reddet' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'İzin talebi UUID' })
  @ApiResponse({ status: 200, description: 'İzin talebi başarıyla işlendi' })
  @ApiResponse({ status: 400, description: 'Talep zaten işlenmiş' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'İzin talebi bulunamadı' })
  @Patch('requests/:id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.leaveService.approveRequest(id, dto);
  }

  /** Çalışanın izin bakiyesi */
  @ApiOperation({ summary: 'Çalışanın yıllık izin bakiyesini getir' })
  @ApiParam({ name: 'employeeId', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiQuery({ name: 'year', required: true, type: Number, description: 'Yıl (örn. 2026)' })
  @ApiResponse({ status: 200, description: 'İzin bakiyesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @Get('balance/:employeeId')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.leaveService.getBalance(employeeId, year);
  }

  /** Ücretsiz izin günleri (bordro için) */
  @ApiOperation({ summary: 'Belirli ay için ücretsiz izin günlerini getir (bordro entegrasyonu)' })
  @ApiParam({ name: 'employeeId', type: 'string', format: 'uuid', description: 'Çalışan UUID' })
  @ApiQuery({ name: 'month', required: true, type: Number, description: 'Ay (1-12)' })
  @ApiQuery({ name: 'year', required: true, type: Number, description: 'Yıl (örn. 2026)' })
  @ApiResponse({ status: 200, description: 'Ücretsiz izin gün sayısı döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('unpaid-days/:employeeId')
  getUnpaidDays(
    @Param('employeeId') employeeId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.leaveService.getUnpaidLeaveDays(employeeId, month, year);
  }
}
