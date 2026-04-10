import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import * as crypto from 'crypto';
import { TenantGuard } from '@enkap/database';
import { ShipmentService } from './shipment.service';
import { Shipment, CarrierCode, ShipmentStatus } from './entities/shipment.entity';
import {
  CreateShipmentDto,
  UpdateShipmentStatusDto,
} from './dto/create-shipment.dto';

/**
 * Lojistik / Kargo Gönderisi Controller.
 *
 * Kargo gönderisi oluşturma, takip ve etiket alma işlemlerini sunar.
 * Webhook endpoint'leri @Public() — HMAC-SHA256 imza doğrulaması ile korunur.
 */
@ApiTags('logistics')
@Controller('logistics')
export class ShipmentController {
  private readonly logger = new Logger(ShipmentController.name);

  constructor(private readonly shipmentService: ShipmentService) {}

  // ---- Tenant korumalı endpoint'ler ----

  @Post('shipments')
  @UseGuards(TenantGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Yeni kargo gönderisi oluştur' })
  @ApiResponse({ status: 201, description: 'Gönderi oluşturuldu', type: Shipment })
  async createShipment(@Body() dto: CreateShipmentDto): Promise<Shipment> {
    return this.shipmentService.createShipment(dto);
  }

  @Get('shipments')
  @UseGuards(TenantGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Kargo gönderilerini listele' })
  @ApiQuery({ name: 'status', enum: ShipmentStatus, required: false })
  @ApiQuery({ name: 'carrier', enum: CarrierCode, required: false })
  @ApiResponse({ status: 200, type: [Shipment] })
  async listShipments(
    @Query('status') status?: ShipmentStatus,
    @Query('carrier') carrier?: CarrierCode,
  ): Promise<Shipment[]> {
    return this.shipmentService.listShipments({ status, carrier });
  }

  @Get('shipments/:id')
  @UseGuards(TenantGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Gönderi detayını getir' })
  @ApiParam({ name: 'id', description: 'Gönderi UUID' })
  @ApiResponse({ status: 200, type: Shipment })
  async getShipment(@Param('id') id: string): Promise<Shipment> {
    return this.shipmentService.getShipment(id);
  }

  @Post('shipments/:id/track')
  @UseGuards(TenantGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gönderi durumunu kargo firmasından sorgula ve güncelle' })
  @ApiParam({ name: 'id', description: 'Gönderi UUID' })
  @ApiResponse({ status: 200, type: Shipment })
  async trackShipment(@Param('id') id: string): Promise<Shipment> {
    return this.shipmentService.trackShipment(id);
  }

  @Get('shipments/:id/label')
  @UseGuards(TenantGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Kargo etiketi PDF\'ini base64 olarak al' })
  @ApiParam({ name: 'id', description: 'Gönderi UUID' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { label: { type: 'string' } } } })
  async getLabel(@Param('id') id: string): Promise<{ label: string }> {
    const label = await this.shipmentService.getLabel(id);
    return { label };
  }

  // ---- Açık takip endpoint'i (müşteri self-servis) ----

  @Get('track/:trackingNo')
  @ApiOperation({ summary: 'Takip numarası ile kargo durumunu sorgula (açık endpoint)' })
  @ApiParam({ name: 'trackingNo', description: 'Kargo takip numarası' })
  @ApiQuery({ name: 'carrier', enum: CarrierCode, required: true })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.values(ShipmentStatus) },
        description: { type: 'string' },
      },
    },
  })
  async trackByNumber(
    @Param('trackingNo') trackingNo: string,
    @Query('carrier') carrier: CarrierCode,
  ): Promise<{ status: ShipmentStatus; description: string }> {
    return this.shipmentService.trackByTrackingNumber(trackingNo, carrier);
  }

  // ---- Kargo firması webhook endpoint'leri ----
  // @Public() — TenantGuard yok, HMAC-SHA256 imza doğrulaması ile korunur

  @Post('webhook/aras')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aras Kargo webhook bildirimi (kargo firmasından)' })
  @ApiResponse({ status: 200 })
  async handleArasWebhook(
    @Body() dto: UpdateShipmentStatusDto,
    @Headers('x-carrier-signature') signature: string,
    @Body() rawBody: Buffer,
  ): Promise<void> {
    this.verifyWebhookSignature(rawBody, signature, 'ARAS_WEBHOOK_SECRET', 'Aras');
    await this.shipmentService.handleWebhook(dto, CarrierCode.ARAS);
  }

  @Post('webhook/yurtici')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yurtiçi Kargo webhook bildirimi (kargo firmasından)' })
  @ApiResponse({ status: 200 })
  async handleYurticiWebhook(
    @Body() dto: UpdateShipmentStatusDto,
    @Headers('x-carrier-signature') signature: string,
    @Body() rawBody: Buffer,
  ): Promise<void> {
    this.verifyWebhookSignature(rawBody, signature, 'YURTICI_WEBHOOK_SECRET', 'Yurtiçi');
    await this.shipmentService.handleWebhook(dto, CarrierCode.YURTICI);
  }

  @Post('webhook/ptt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PTT Kargo webhook bildirimi (kargo firmasından)' })
  @ApiResponse({ status: 200 })
  async handlePttWebhook(
    @Body() dto: UpdateShipmentStatusDto,
    @Headers('x-carrier-signature') signature: string,
    @Body() rawBody: Buffer,
  ): Promise<void> {
    this.verifyWebhookSignature(rawBody, signature, 'PTT_WEBHOOK_SECRET', 'PTT');
    await this.shipmentService.handleWebhook(dto, CarrierCode.PTT);
  }

  // ---- Private Yardımcı ----

  /**
   * HMAC-SHA256 imza doğrulaması.
   * Secret env yoksa stub modda atlanır, log.warn ile bildirim yapılır.
   * Timing-safe karşılaştırma: zamanlama saldırılarına karşı koruma.
   */
  private verifyWebhookSignature(
    body: Buffer,
    signature: string,
    secretEnvKey: string,
    carrierName: string,
  ): void {
    const secret = process.env[secretEnvKey];

    if (!secret) {
      this.logger.warn(
        `${secretEnvKey} tanımlı değil — ${carrierName} webhook imzası atlanıyor (stub mod)`,
      );
      return;
    }

    if (!signature) {
      throw new BadRequestException('X-Carrier-Signature header eksik');
    }

    const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    // Farklı uzunlukta buffer'lar için sabit uzunlukta karşılaştırma
    if (expectedBuffer.length !== receivedBuffer.length) {
      throw new BadRequestException('Geçersiz webhook imzası');
    }

    // Timing-safe karşılaştırma — zamanlama tabanlı saldırı engeli
    if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      throw new BadRequestException('Geçersiz webhook imzası');
    }
  }
}
