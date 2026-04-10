import { Module } from '@nestjs/common';
import { MembersService }    from './members.service';
import { MembersController } from './members.controller';
import { AuthModule }        from '../auth/auth.module';
import { TenantModule }      from '@enkap/database';

/**
 * Tenant üye yönetimi modülü.
 *
 * AuthModule: PasswordResetService (davet e-postası), JwtStrategy
 * TenantModule: TenantDataSourceManager (tenant DB erişimi)
 * control_plane DataSource: AuthModule'deki TypeOrmModule.forRootAsync ile kayıtlı
 */
@Module({
  imports:     [AuthModule, TenantModule],
  providers:   [MembersService],
  controllers: [MembersController],
  exports:     [MembersService],
})
export class MembersModule {}
