import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { ProjectService }       from './project.service';
import { CreateProjectDto }     from './dto/create-project.dto';
import { UpdateProjectDto }     from './dto/create-project.dto';
import { AddProjectCostDto }    from './dto/create-project.dto';
import { CreateProjectTaskDto } from './dto/create-project.dto';
import { UpdateProjectTaskDto } from './dto/create-project.dto';

/**
 * Proje Yönetimi REST uç noktaları.
 *
 * Sprint 5B — Proje bazlı maliyet, gelir ve kar/zarar takibi.
 * Her proje WBS görevlere bölünebilir; maliyetler görev bazında izlenebilir.
 */
@ApiTags('projects')
@ApiBearerAuth('JWT')
@Controller('projects')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  // ─── Proje CRUD ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Yeni proje oluştur' })
  @ApiResponse({ status: 201, description: 'Proje başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz veri' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateProjectDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub ?? '00000000-0000-0000-0000-000000000000';
    return this.projectService.create(dto, userId);
  }

  @ApiOperation({ summary: 'Projeleri listele' })
  @ApiQuery({ name: 'status',     required: false, description: 'AKTIF | BEKLEMEDE | TAMAMLANDI | IPTAL' })
  @ApiQuery({ name: 'customerId', required: false, description: 'CRM müşteri UUID filtresi' })
  @ApiQuery({ name: 'page',       required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit',      required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Proje listesi ve toplam sayı' })
  @Get()
  findAll(
    @Query('status')     status?:     string,
    @Query('customerId') customerId?: string,
    @Query('page')       page?:       string,
    @Query('limit')      limit?:      string,
  ) {
    return this.projectService.findAll({
      status,
      customerId,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Proje detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Proje detayı' })
  @ApiResponse({ status: 404, description: 'Proje bulunamadı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.findOne(id);
  }

  @ApiOperation({ summary: 'Proje bilgilerini güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Proje güncellendi' })
  @ApiResponse({ status: 404, description: 'Proje bulunamadı' })
  @ApiResponse({ status: 409, description: 'Tamamlanmış/iptal projeyi güncelleyemezsiniz' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.update(id, dto);
  }

  // ─── Durum Geçişleri ───────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Projeyi tamamlandı olarak kapat' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Proje TAMAMLANDI durumuna geçti' })
  @ApiResponse({ status: 409, description: 'Proje zaten tamamlandı veya iptal edildi' })
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.close(id);
  }

  @ApiOperation({ summary: 'Projeyi iptal et' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Proje IPTAL durumuna geçti' })
  @ApiResponse({ status: 409, description: 'Proje zaten iptal/tamamlandı' })
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.cancel(id);
  }

  // ─── Maliyet Yönetimi ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Projeye maliyet kalemi ekle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Proje UUID' })
  @ApiResponse({ status: 201, description: 'Maliyet kalemi eklendi' })
  @ApiResponse({ status: 404, description: 'Proje bulunamadı' })
  @Post(':id/costs')
  @HttpCode(HttpStatus.CREATED)
  addCost(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: AddProjectCostDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub ?? '00000000-0000-0000-0000-000000000000';
    return this.projectService.addCost(projectId, dto, userId);
  }

  @ApiOperation({ summary: 'Proje maliyet kalemlerini listele' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Proje UUID' })
  @ApiQuery({ name: 'page',  required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Maliyet kalemleri listesi' })
  @Get(':id/costs')
  findCosts(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectService.findCosts(
      projectId,
      page  ? parseInt(page,  10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ─── Kar/Zarar Raporu ──────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Proje Kar/Zarar (P&L) raporu',
    description: 'Planlanan bütçe, gerçekleşen maliyet, fatura gelirleri ve kar marjı',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Proje UUID' })
  @ApiResponse({ status: 200, description: 'P&L raporu' })
  @ApiResponse({ status: 404, description: 'Proje bulunamadı' })
  @Get(':id/pnl')
  getProjectPnL(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.getProjectPnL(id);
  }

  // ─── Görev (WBS) Yönetimi ──────────────────────────────────────────────────

  @ApiOperation({ summary: 'Projeye WBS görevi ekle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Proje UUID' })
  @ApiResponse({ status: 201, description: 'Görev eklendi' })
  @Post(':id/tasks')
  @HttpCode(HttpStatus.CREATED)
  addTask(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProjectTaskDto,
  ) {
    return this.projectService.addTask(projectId, dto);
  }

  @ApiOperation({ summary: 'Proje görevlerini listele' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Proje UUID' })
  @ApiQuery({ name: 'page',  required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Görev listesi (sıralanmış)' })
  @Get(':id/tasks')
  findTasks(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectService.findTasks(
      projectId,
      page  ? parseInt(page,  10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @ApiOperation({ summary: 'Görevi güncelle (durum, gerçekleşen saat vb.)' })
  @ApiParam({ name: 'id',     type: 'string', format: 'uuid', description: 'Proje UUID' })
  @ApiParam({ name: 'taskId', type: 'string', format: 'uuid', description: 'Görev UUID' })
  @ApiResponse({ status: 200, description: 'Görev güncellendi' })
  @Patch(':id/tasks/:taskId')
  updateTask(
    @Param('id',     ParseUUIDPipe) projectId: string,
    @Param('taskId', ParseUUIDPipe) taskId:    string,
    @Body() dto: UpdateProjectTaskDto,
  ) {
    return this.projectService.updateTask(projectId, taskId, dto);
  }
}
