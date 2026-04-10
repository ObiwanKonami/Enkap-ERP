import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, COMMON_REQUIRED_ENV } from '@enkap/shared-types';

initTracing('crm-service');
validateEnv(COMMON_REQUIRED_ENV, { service: 'crm-service' });

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
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
    .setTitle('Enkap — CRM Service')
    .setDescription('Müşteri/tedarikçi kişi yönetimi, satış pipeline (Kanban), aktivite takibi')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('contacts',   'Müşteri ve tedarikçi kişiler (TCKN/VKN)')
    .addTag('leads',      'Satış fırsatları ve pipeline yönetimi')
    .addTag('activities', 'Çağrı, e-posta, toplantı, görev takibi')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3009';
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('CrmService');
  logger.log(`CRM Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('CRM Service başlatma hatası:', err);
  process.exit(1);
});
