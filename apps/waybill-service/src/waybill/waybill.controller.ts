import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseUUIDPipe, ParseIntPipe, DefaultValuePipe, Res, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { WaybillService }    from './waybill.service';
import { WaybillPdfService } from './waybill-pdf.service';
import { WaybillXmlService } from './waybill-xml.service';
import { CreateWaybillDto }  from './dto/create-waybill.dto';
import type { WaybillType, WaybillStatus } from './entities/waybill.entity';

/** X-User-ID header'dan kullanıcı ID'sini çıkarır */
function userId(req: { headers: Record<string, string | undefined> }): string {
  return req.headers['x-user-id'] ?? 'system';
}

@ApiTags('İrsaliyeler')
@ApiBearerAuth()
@Controller('waybills')
export class WaybillController {
  constructor(
    private readonly waybillService: WaybillService,
    private readonly pdfService:     WaybillPdfService,
    private readonly xmlService:     WaybillXmlService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Yeni irsaliye oluştur' })
  create(@Body() dto: CreateWaybillDto, @Res({ passthrough: true }) _res: FastifyReply, @Query() _q: unknown) {
    // Gerçek uygulamada JWT'den kullanıcı alınır; basitlik için header'dan
    return this.waybillService.create(dto, 'system');
  }

  @Get()
  @ApiOperation({ summary: 'İrsaliye listesi' })
  @ApiQuery({ name: 'type',   required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'refId',  required: false })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  findAll(
    @Query('type')   type?:   WaybillType,
    @Query('status') status?: WaybillStatus,
    @Query('refId')  refId?:  string,
    @Query('limit',  new DefaultValuePipe(100), ParseIntPipe) limit?:  number,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset?: number,
  ) {
    return this.waybillService.findAll({ type, status, refId, limit, offset });
  }

  @Get(':id')
  @ApiOperation({ summary: 'İrsaliye detayı' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.waybillService.findOne(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'İrsaliyeyi onayla (TASLAK → ONAYLANDI)' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.waybillService.approve(id);
  }

  @Post(':id/send-gib')
  @ApiOperation({ summary: 'GİB e-İrsaliye gönderim kuyruğuna al' })
  sendGib(@Param('id', ParseUUIDPipe) id: string) {
    return this.waybillService.queueForGib(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'İrsaliyeyi iptal et' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.waybillService.cancel(id, reason);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Taslak irsaliyeyi güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateWaybillDto>,
  ) {
    return this.waybillService.update(id, dto);
  }

  /** PDF indir */
  @Get(':id/pdf')
  @ApiOperation({ summary: 'İrsaliye PDF indir' })
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: FastifyReply,
  ) {
    const waybill = await this.waybillService.findOne(id);
    const pdfBuffer = await this.pdfService.generate(waybill);

    void res.status(HttpStatus.OK)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${waybill.waybillNumber}.pdf"`)
      .send(pdfBuffer);
  }

  /** UBL-TR XML indir */
  @Get(':id/xml')
  @ApiOperation({ summary: 'e-İrsaliye UBL-TR XML indir' })
  async downloadXml(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: FastifyReply,
  ) {
    const waybill = await this.waybillService.findOne(id);
    const xml = this.xmlService.generate(waybill);

    void res.status(HttpStatus.OK)
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', `attachment; filename="${waybill.waybillNumber}.xml"`)
      .send(xml);
  }
}
