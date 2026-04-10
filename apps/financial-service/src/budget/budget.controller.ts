import {
  Controller, Get, Post, Param, Body, Query, UseGuards,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantGuard, getTenantContext } from '@enkap/database';
import { BudgetService } from './budget.service';
import { CreateBudgetDto, UpsertBudgetLineDto } from './dto/create-budget.dto';

@ApiTags('Bütçe')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('budgets')
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni bütçe dönemi oluştur' })
  create(@Body() dto: CreateBudgetDto) {
    const { userId } = getTenantContext();
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Bütçe listesi' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  findAll(
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      year ? Number(year) : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bütçe detayı + kalemler' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/lines')
  @ApiOperation({ summary: 'Bütçe kalemi ekle / güncelle (accountCode bazında)' })
  upsertLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertBudgetLineDto,
  ) {
    return this.service.upsertLine(id, dto);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Bütçeyi onayla' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    const { userId } = getTenantContext();
    return this.service.approve(id, userId);
  }

  @Get(':id/variance')
  @ApiOperation({ summary: 'Bütçe vs gerçekleşme sapma raporu' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: '1-12 (belirtilmezse yıllık)' })
  getVarianceReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('month') month?: string,
  ) {
    return this.service.getVarianceReport(id, month ? Number(month) : undefined);
  }

  @Get(':id/forecast')
  @ApiOperation({ summary: 'Revize tahmin (YTD + kalan bütçe)' })
  forecastRevised(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.forecastRevised(id);
  }
}
