import { Module }     from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OAuthService }    from './oauth.service';
import { OAuthController } from './oauth.controller';

/**
 * OAuth2 Marketplace Modülü.
 *
 * Sağladıkları:
 *  - POST /api/v1/oauth/token    — client_credentials grant
 *  - POST /api/v1/oauth/clients  — API istemcisi oluştur (JWT korumalı)
 *  - GET  /api/v1/oauth/clients  — API istemcilerini listele
 *  - DELETE /api/v1/oauth/clients/:clientId — iptal et
 *
 * AuthModule'den JwtModule re-export alır → OAuthService JwtService'i kullanabilir.
 */
@Module({
  imports:     [AuthModule],
  providers:   [OAuthService],
  controllers: [OAuthController],
})
export class OAuthModule {}
