import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
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
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { ProductService, type BulkImportResult } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('products')
@ApiBearerAuth('JWT')
@Controller('products')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.DEPO_SORUMLUSU, Role.SATIN_ALMA, Role.SATIS_TEMSILCISI)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * Ürün listesi.
   * ?search=laptop&categoryId=uuid&page=1&limit=50&isActive=true
   */
  @ApiOperation({ summary: 'Ürün listesi' })
  @ApiQuery({ name: 'search', required: false, description: 'Ürün adı veya SKU ile arama' })
  @ApiQuery({ name: 'categoryId', required: false, type: String, format: 'uuid', description: 'Kategori UUID filtresi' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt sayısı (varsayılan: 50)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Aktif/pasif filtresi (varsayılan: true)' })
  @ApiResponse({ status: 200, description: 'Ürün listesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.productService.findAll({
      search,
      categoryId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      isActive: isActive === 'false' ? false : true,
    });
  }

  /** Barkod ile ürün ara — mobil barkod tarama için */
  @ApiOperation({ summary: 'Barkod ile ürün ara (mobil barkod tarama)' })
  @ApiParam({ name: 'barcode', type: 'string', description: 'Ürün barkodu (EAN-13, QR vb.)' })
  @ApiResponse({ status: 200, description: 'Ürün başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Barkod bulunamadı' })
  @Get('barcode/:barcode')
  async findByBarcode(@Param('barcode') barcode: string) {
    return this.productService.findByBarcode(barcode);
  }

  @ApiOperation({ summary: 'Ürün detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Ürün UUID' })
  @ApiResponse({ status: 200, description: 'Ürün başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findById(id);
  }

  @ApiOperation({ summary: 'Yeni ürün oluştur' })
  @ApiResponse({ status: 201, description: 'Ürün başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek — doğrulama hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 409, description: 'SKU zaten kullanılıyor' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @ApiOperation({ summary: 'Ürün bilgilerini güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Ürün UUID' })
  @ApiResponse({ status: 200, description: 'Ürün başarıyla güncellendi' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek — doğrulama hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, dto);
  }

  /** Soft delete — pasife al */
  @ApiOperation({ summary: 'Ürünü pasife al (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Ürün UUID' })
  @ApiResponse({ status: 204, description: 'Ürün başarıyla pasife alındı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Ürün bulunamadı' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.productService.deactivate(id);
  }

  // ─── Excel toplu import ──────────────────────────────────────────────────────

  /**
   * Excel dosyasından toplu ürün import eder.
   * Body: { excelBase64: string } — base64 kodlanmış .xlsx dosyası.
   * Yanıt: Her satır için başarı/hata sonucu (207 Multi-Status).
   */
  @ApiOperation({ summary: 'Excel dosyasından toplu ürün import et' })
  @ApiBody({ schema: { type: 'object', properties: { excelBase64: { type: 'string', description: 'Base64 kodlanmış .xlsx dosyası' } }, required: ['excelBase64'] } })
  @ApiResponse({ status: 207, description: 'Toplu import tamamlandı — her satır için başarı/hata sonucu döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post('bulk')
  @HttpCode(207)
  async bulkImport(
    @Body() body: { excelBase64: string },
  ): Promise<BulkImportResult[]> {
    return this.productService.importFromExcel(body.excelBase64);
  }

  // ─── Kategori endpoint'leri ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Ürün kategorilerini listele' })
  @ApiResponse({ status: 200, description: 'Kategori listesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('categories/list')
  async getCategories() {
    return this.productService.findCategories();
  }

  @ApiOperation({ summary: 'Yeni ürün kategorisi oluştur' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string', description: 'Kategori adı' }, code: { type: 'string', description: 'Kategori kodu' }, parentId: { type: 'string', format: 'uuid', description: 'Üst kategori UUID (opsiyonel)' } }, required: ['name', 'code'] } })
  @ApiResponse({ status: 201, description: 'Kategori başarıyla oluşturuldu' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @Body() dto: { name: string; code: string; parentId?: string },
  ) {
    return this.productService.createCategory(dto);
  }
}
