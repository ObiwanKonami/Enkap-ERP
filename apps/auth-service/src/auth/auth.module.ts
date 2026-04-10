import { Module }        from '@nestjs/common';
import { JwtModule }     from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule }  from '@nestjs/config';
import { TenantModule }  from '@enkap/database';
import { MailerModule }  from '@enkap/mailer';
import { AuthService }           from './auth.service';
import { AuthController }        from './auth.controller';
import { JwtTokenFactory }       from './jwt-token.factory';
import { RefreshTokenStore }     from './refresh-token.store';
import { LocalStrategy }         from './strategies/local.strategy';
import { JwtStrategy }           from './strategies/jwt.strategy';
import { UserRepository }        from '../user/user.repository';
import { PasswordResetService }      from './password-reset.service';
import { EmailVerificationService }  from './email-verification.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule,

    // Control plane veritabanı bağlantısı (tenantSlug → tenantId çözümleme için)
    TypeOrmModule.forRootAsync({
      name: 'control_plane',
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        schema: 'public',
        entities: [],
        synchronize: false,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : false,
        applicationName: 'enkap_auth_service',
      }),
    }),

    // TenantModule: TenantDataSourceManager + TenantRoutingService (tenant DB erişimi için)
    TenantModule,

    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'CHANGE_IN_PRODUCTION',
        signOptions: {
          expiresIn: '1h',
          issuer: process.env.JWT_ISSUER ?? 'https://auth.enkap.local',
          audience: 'erp-api',
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    JwtTokenFactory,
    RefreshTokenStore,
    LocalStrategy,
    JwtStrategy,
    UserRepository,
    PasswordResetService,
    EmailVerificationService,
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PasswordResetService],
})
export class AuthModule {}
