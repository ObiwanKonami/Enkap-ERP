import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { getTenantContext } from '@enkap/database';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifService: NotificationService) {}

  @ApiOperation({ summary: 'Bildirimleri listele' })
  @ApiQuery({ name: 'limit',      required: false, type: Number })
  @ApiQuery({ name: 'offset',     required: false, type: Number })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Bildirim listesi + okunmamış sayısı' })
  @Get()
  findAll(
    @Query('limit')      limit?: string,
    @Query('offset')     offset?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const { tenantId } = getTenantContext();
    return this.notifService.findAll(tenantId, {
      limit:      limit      ? parseInt(limit, 10)  : undefined,
      offset:     offset     ? parseInt(offset, 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @ApiOperation({ summary: 'Tek bildirimi okundu işaretle' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200 })
  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    const { tenantId } = getTenantContext();
    return this.notifService.markRead(tenantId, id);
  }

  @ApiOperation({ summary: 'Tüm bildirimleri okundu işaretle' })
  @ApiResponse({ status: 200, description: '{ updated: number }' })
  @Patch('read-all')
  markAllRead() {
    const { tenantId } = getTenantContext();
    return this.notifService.markAllRead(tenantId);
  }

  @ApiOperation({ summary: 'Bildirimi sil' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204 })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const { tenantId } = getTenantContext();
    await this.notifService.remove(tenantId, id);
  }
}
