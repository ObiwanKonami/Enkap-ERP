import { Module }        from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule }     from '../auth/auth.module'; // JwtModule re-export için
import { PlatformAdminRepository }  from './platform-admin.repository';
import { PlatformRefreshTokenStore } from './platform-refresh-token.store';
import { PlatformAdminService }     from './platform-admin.service';
import { PlatformLocalStrategy }    from './platform-local.strategy';
import { PlatformJwtStrategy }      from './platform-jwt.strategy';
import { PlatformAdminController }  from './platform-admin.controller';

/**
 * Platform (SaaS) admin kimlik doğrulama modülü.
 *
 * AuthModule'ü import eder → JwtModule (signAsync için) ve
 * control_plane TypeOrmModule mevcut.
 */
@Module({
  imports: [
    AuthModule,
    PassportModule,
  ],
  providers: [
    PlatformAdminRepository,
    PlatformRefreshTokenStore,
    PlatformAdminService,
    PlatformLocalStrategy,
    PlatformJwtStrategy,
  ],
  controllers: [PlatformAdminController],
})
export class PlatformModule {}
