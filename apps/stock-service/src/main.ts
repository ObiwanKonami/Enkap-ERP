import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, COMMON_REQUIRED_ENV } from '@enkap/shared-types';

initTracing('stock-service');
validateEnv(COMMON_REQUIRED_ENV, { service: 'stock-service' });

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
    .setTitle('Enkap — Stock Service')
    .setDescription('Ürün yönetimi, depo, stok hareketleri, FIFO/AVG maliyet, marketplace senkronizasyon')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('products',    'Ürün CRUD, barkod, toplu import')
    .addTag('warehouses',  'Depo yönetimi')
    .addTag('movements',   'Stok giriş/çıkış/transfer hareketleri')
    .addTag('marketplace', 'Trendyol & Hepsiburada entegrasyonu')
    .addTag('reports',     'Stok raporları (PDF/Excel)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3004';
  await app.listen(parseInt(port, 10), '0.0.0.0');

  const logger = new Logger('StockService');
  logger.log(`Stock Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Stock Service başlatma hatası:', err);
  process.exit(1);
});
