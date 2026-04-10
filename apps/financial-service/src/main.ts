import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, FINANCIAL_REQUIRED_ENV } from '@enkap/shared-types';

validateEnv(FINANCIAL_REQUIRED_ENV, { service: 'financial-service' });
initTracing('financial-service');

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
    .setTitle('Enkap — Financial Service')
    .setDescription('Fatura, KDV, AR/AP yaşlandırma, e-Defter, Ba/Bs, muhasebe raporları')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('invoices',  'Fatura yönetimi (CRUD, onay, iptal, GİB)')
    .addTag('ar-ap',     'Alacak/Borç yaşlandırma ve ödeme planı')
    .addTag('accounts',  'Muhasebe hesapları, mizan, bilanço')
    .addTag('edefter',   'e-Defter önizleme ve GİB gönderim')
    .addTag('babs',      'Ba/Bs formu üretimi')
    .addTag('reporting', 'PDF ve Excel raporları')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3003';
  await app.listen(parseInt(port, 10), '0.0.0.0');

  const logger = new Logger('FinancialService');
  logger.log(`Financial Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Financial Service başlatma hatası:', err);
  process.exit(1);
});
