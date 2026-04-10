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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { MembersService, type MemberRole } from './members.service';

/**
 * Tenant üye yönetimi endpoint'leri.
 *
 * Bu endpoint'ler tenant kullanıcılarına (çalışanlardan sisteme erişim yetkisi
 * verilmiş kişilere) ait CRUD işlemlerini gerçekleştirir.
 *
 * Akış:
 *  invite → kullanıcı oluşturulur (PENDING) → şifre sıfırlama e-postası gider
 *  → kullanıcı giriş yapar → ACTIVE
 */
@ApiTags('members')
@ApiBearerAuth('JWT')
@Controller('tenants/:tenantId/members')
@UseGuards(AuthGuard('jwt'))
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Tenant üyelerini listele' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt (maks 200, varsayılan 50)' })
  @ApiResponse({ status: 200, description: 'Üye listesi' })
  list(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.membersService.list(tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ekibe üye davet et' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Üye oluşturuldu, davet e-postası gönderildi' })
  @ApiResponse({ status: 409, description: 'Bu e-posta zaten kayıtlı' })
  invite(
    @Param('tenantId') tenantId: string,
    @Body() body: { email: string; name?: string; role: MemberRole },
  ) {
    return this.membersService.invite(tenantId, body);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Üye rolünü güncelle' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId',   type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Rol güncellendi' })
  @ApiResponse({ status: 404, description: 'Kullanıcı bulunamadı' })
  updateRole(
    @Param('tenantId') tenantId: string,
    @Param('userId')   userId:   string,
    @Body('role')      role:     MemberRole,
  ) {
    return this.membersService.updateRole(tenantId, userId, role);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Üyeyi pasif yap' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId',   type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Üye pasif yapıldı' })
  async deactivate(
    @Param('tenantId') tenantId: string,
    @Param('userId')   userId:   string,
  ) {
    await this.membersService.deactivate(tenantId, userId);
  }
}
