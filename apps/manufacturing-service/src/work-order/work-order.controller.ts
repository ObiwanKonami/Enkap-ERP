import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Request,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '@enkap/database';
import { WorkOrderService } from './work-order.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CompleteWorkOrderDto } from './dto/complete-work-order.dto';

/** Fastify request tipi — NestJS genel request arayüzü */
interface FastifyRequest {
  user?: { sub?: string };
}

@ApiTags('work-orders')
@ApiBearerAuth('JWT')
@Controller('work-orders')
@UseGuards(TenantGuard)
export class WorkOrderController {
  constructor(private readonly workOrderService: WorkOrderService) {}

  @ApiOperation({ summary: 'İş emri listesi' })
  @ApiQuery({ name: 'status', required: false, description: 'Durum filtresi (TASLAK, PLANLI, URETIMDE, TAMAMLANDI, IPTAL)' })
  @ApiQuery({ name: 'productId', required: false, type: String, format: 'uuid', description: 'Ürün UUID filtresi' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt (maks 200, varsayılan 50)' })
  @ApiResponse({ status: 200, description: 'İş emri listesi döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workOrderService.findAll({
      status,
      productId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'İş emri detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'İş emri UUID' })
  @ApiResponse({ status: 200, description: 'İş emri detayı döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'İş emri bulunamadı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.findOne(id);
  }

  @ApiOperation({ summary: 'Yeni iş emri oluştur' })
  @ApiResponse({ status: 201, description: 'İş emri oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Doğrulama hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Reçete bulunamadı' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateWorkOrderDto,
    @Request() req: FastifyRequest,
  ) {
    return this.workOrderService.create(dto, req.user?.sub ?? 'system');
  }

  @ApiOperation({ summary: 'İş emrini onayla — TASLAK → PLANLI' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'İş emri UUID' })
  @ApiResponse({ status: 200, description: 'İş emri onaylandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'İş emri bulunamadı' })
  @ApiResponse({ status: 409, description: 'Geçersiz durum geçişi' })
  @Patch(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.confirm(id);
  }

  @ApiOperation({ summary: 'Üretime başla — PLANLI → URETIMDE' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'İş emri UUID' })
  @ApiResponse({ status: 200, description: 'Üretim başlatıldı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'İş emri bulunamadı' })
  @ApiResponse({ status: 409, description: 'Geçersiz durum geçişi' })
  @Patch(':id/start')
  startProduction(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.startProduction(id);
  }

  @ApiOperation({
    summary: 'Üretimi tamamla — URETIMDE → TAMAMLANDI',
    description:
      'Hammadde CIKIS ve mamul GIRIS hareketleri stock-service\'e gönderilir. ' +
      'Herhangi bir hareket başarısız olursa compensating transaction çalışır.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'İş emri UUID' })
  @ApiResponse({ status: 200, description: 'Üretim tamamlandı, stok güncellendi' })
  @ApiResponse({ status: 400, description: 'Stok hareketi kaydedilemedi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'İş emri bulunamadı' })
  @ApiResponse({ status: 409, description: 'Geçersiz durum geçişi' })
  @Patch(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteWorkOrderDto,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.workOrderService.complete(id, dto, authHeader);
  }

  @ApiOperation({ summary: 'İş emrini iptal et' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'İş emri UUID' })
  @ApiResponse({ status: 200, description: 'İş emri iptal edildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'İş emri bulunamadı' })
  @ApiResponse({ status: 409, description: 'Tamamlanmış iş emirleri iptal edilemez' })
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.workOrderService.cancel(id);
  }
}
