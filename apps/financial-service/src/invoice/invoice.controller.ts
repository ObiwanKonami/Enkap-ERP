import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
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
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role, type InvoiceStatus } from '@enkap/shared-types';
import { InvoiceService, type BulkCreateResult } from './invoice.service';
import type {
  CreateInvoiceDto,
  CreateInvoiceFromOrderDto,
  ApproveInvoiceDto,
  CancelInvoiceDto,
} from './dto/create-invoice.dto';

@ApiTags('invoices')
@ApiBearerAuth('JWT')
@Controller('invoices')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI, Role.SATIS_TEMSILCISI)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /** Yeni fatura oluştur (DRAFT olarak) */
  @ApiOperation({ summary: 'Yeni fatura oluştur', description: 'Tenant için yeni bir fatura DRAFT statüsünde oluşturur' })
  @ApiResponse({ status: 201, description: 'Fatura başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek verisi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoiceService.create(dto);
  }

  /** Satış siparişinden otomatik fatura oluştur */
  @ApiOperation({ summary: 'Siparişten fatura oluştur', description: 'Satış siparişi verilerinden otomatik OUT fatura oluşturur' })
  @ApiResponse({ status: 201, description: 'Fatura başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Sipariş bulunamadı veya uygun durumda değil' })
  @ApiResponse({ status: 409, description: 'Bu sipariş için zaten fatura mevcut' })
  @Post('from-order')
  @HttpCode(HttpStatus.CREATED)
  createFromOrder(@Body() dto: CreateInvoiceFromOrderDto) {
    return this.invoiceService.createFromOrder(dto);
  }

  /**
   * Toplu fatura oluşturma (max 100 adet).
   * Hata olan satır atlanır, diğerleri oluşturulur.
   * Her öğe için success/error durumu döner.
   */
  @ApiOperation({ summary: 'Toplu fatura oluştur', description: 'Maksimum 100 adet faturayı tek seferde oluşturur. Hata olan satır atlanır, diğerleri işlenir. Her öğe için success/error durumu döner' })
  @ApiResponse({ status: 207, description: 'Çoklu durum — her fatura için ayrı sonuç döner' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('bulk')
  @HttpCode(207) // HTTP 207 Multi-Status
  bulkCreate(@Body() body: { items: CreateInvoiceDto[] }): Promise<BulkCreateResult[]> {
    return this.invoiceService.bulkCreate(body.items ?? []);
  }

  /** Fatura listesi (filtrelenebilir) */
  @ApiOperation({ summary: 'Fatura listesi', description: 'Tenant faturalarını filtreli getirir' })
  @ApiQuery({ name: 'status', required: false, description: 'Fatura durumu filtresi (DRAFT, PENDING_GIB, ACCEPTED_GIB, CANCELLED vb.)' })
  @ApiQuery({ name: 'direction', required: false, enum: ['OUT', 'IN'], description: 'Fatura yönü — OUT: satış, IN: alış' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Fatura numarası ile arama' })
  @ApiQuery({ name: 'limit', required: false, description: 'Sayfa başı kayıt (varsayılan: 50, max: 200)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası, 1-indexed (offset yerine kullanılabilir)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Atlanan kayıt sayısı (eski param — page tercih edilir)' })
  @ApiQuery({ name: 'counterpartyId', required: false, description: 'CRM kontakt ID ile filtrele' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get()
  findAll(
    @Query('status') status?: InvoiceStatus,
    @Query('direction') direction?: 'OUT' | 'IN',
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('offset') offset?: string,
    @Query('counterpartyId') counterpartyId?: string,
  ) {
    const parsedLimit  = limit  ? parseInt(limit,  10) : undefined;
    const parsedPage   = page   ? parseInt(page,   10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    // Backwards compatibility: page tercih edilir; yoksa offset varsa sayfa numarasına çevir
    const resolvedPage = parsedPage != null
      ? parsedPage
      : (parsedOffset != null ? Math.floor(parsedOffset / (parsedLimit ?? 50)) + 1 : undefined);

    return this.invoiceService.findAll({
      status,
      direction,
      search,
      counterpartyId,
      limit: parsedLimit,
      page: resolvedPage,
    });
  }

  /** Fatura detayı (satırlarla birlikte) */
  @ApiOperation({ summary: 'Fatura detayı', description: 'Belirtilen faturanın tüm satırlarıyla birlikte detayını getirir' })
  @ApiParam({ name: 'id', description: 'Fatura UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Fatura bulunamadı' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoiceService.findOne(id);
  }

  /** Faturayı onayla (DRAFT → PENDING_GIB veya ACCEPTED_GIB) — sadece muhasebeci */
  @ApiOperation({ summary: 'Fatura onayla', description: 'Faturayı DRAFT statüsünden PENDING_GIB veya ACCEPTED_GIB statüsüne taşır. Sadece muhasebeci rolü' })
  @ApiResponse({ status: 200, description: 'Fatura başarıyla onaylandı' })
  @ApiResponse({ status: 400, description: 'Geçersiz fatura durumu' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Fatura bulunamadı' })
  @Post('approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.MUHASEBECI)
  approve(@Body() dto: ApproveInvoiceDto) {
    return this.invoiceService.approve(dto);
  }

  /** Faturayı iptal et — sadece muhasebeci */
  @ApiOperation({ summary: 'Fatura iptal et', description: 'Faturayı CANCELLED statüsüne taşır. Sadece muhasebeci rolü' })
  @ApiResponse({ status: 200, description: 'Fatura başarıyla iptal edildi' })
  @ApiResponse({ status: 400, description: 'Geçersiz fatura durumu' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Fatura bulunamadı' })
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.MUHASEBECI)
  cancel(@Body() dto: CancelInvoiceDto) {
    return this.invoiceService.cancel(dto);
  }
}
