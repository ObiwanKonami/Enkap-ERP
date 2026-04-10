import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, COMMON_REQUIRED_ENV } from '@enkap/shared-types';

initTracing('purchase-service');
validateEnv(COMMON_REQUIRED_ENV, { service: 'purchase-service' });

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
    .setTitle('Enkap — Purchase Service')
    .setDescription(
      'Satın Alma Yönetimi (P2P): Sipariş oluşturma, onay akışı, mal kabul → stok GIRIS entegrasyonu',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('purchase-orders', 'Satın alma siparişleri ve mal kabul (GRN)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3011';
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('PurchaseService');
  logger.log(`Purchase Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Purchase Service başlatma hatası:', err);
  process.exit(1);
});
