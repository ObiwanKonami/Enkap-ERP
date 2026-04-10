import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, AUTH_REQUIRED_ENV } from '@enkap/shared-types';

validateEnv(AUTH_REQUIRED_ENV, { service: 'auth-service' });
initTracing('auth-service');

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from '@enkap/database';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Enkap — Auth Service')
    .setDescription('JWT kimlik doğrulama, refresh token rotasyonu, şifre sıfırlama, FCM token yönetimi')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('auth',     'Giriş, çıkış, token yenileme')
    .addTag('password', 'Şifre değiştirme ve sıfırlama')
    .addTag('fcm',      'FCM push bildirimi token kaydı')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3001';
  await app.listen(parseInt(port, 10), '0.0.0.0');

  const logger = new Logger('AuthService');
  logger.log(`Auth Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Auth Service başlatma hatası:', err);
  process.exit(1);
});
