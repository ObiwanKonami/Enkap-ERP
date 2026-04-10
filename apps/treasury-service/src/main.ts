import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, COMMON_REQUIRED_ENV } from '@enkap/shared-types';

initTracing('treasury-service');
validateEnv(COMMON_REQUIRED_ENV, { service: 'treasury-service' });

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
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
    .setTitle('Enkap — Treasury Service')
    .setDescription('Kasa & Banka hesap yönetimi, nakit akışı, mutabakat (ekstre eşleştirme)')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('accounts',     'Kasa ve banka hesapları (bakiye, hareket geçmişi)')
    .addTag('transactions', 'Tahsilat, ödeme, transfer, faiz, banka masrafı hareketleri')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3013';
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('TreasuryService');
  logger.log(`Treasury Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Treasury Service başlatma hatası:', err);
  process.exit(1);
});
