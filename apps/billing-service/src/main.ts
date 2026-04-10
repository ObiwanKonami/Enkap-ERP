import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, BILLING_REQUIRED_ENV } from '@enkap/shared-types';

validateEnv(BILLING_REQUIRED_ENV, { service: 'billing-service' });
initTracing('billing-service');

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { BillingModule } from './billing.module';
import { TransformResponseInterceptor } from '@enkap/database';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    BillingModule,
    new FastifyAdapter({ logger: false }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Enkap — Billing Service')
    .setDescription('iyzico ödeme entegrasyonu, abonelik planları, dunning (başarısız ödeme takibi), fatura PDF')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('plans',         'Abonelik planları (starter/business/enterprise)')
    .addTag('subscriptions', 'Abonelik CRUD, kart güncelleme, plan geçişi, iptal')
    .addTag('invoices',      'Abonelik faturası PDF indirme')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3008';
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('BillingService');
  logger.log(`Billing Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Billing Service başlatma hatası:', err);
  process.exit(1);
});
