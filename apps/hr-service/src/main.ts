import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { validateEnv, COMMON_REQUIRED_ENV } from '@enkap/shared-types';

initTracing('hr-service');
validateEnv(COMMON_REQUIRED_ENV, { service: 'hr-service' });

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
    .setTitle('Enkap — HR Service')
    .setDescription('Çalışan yönetimi, bordro hesaplama (2025 SGK oranları), izin talepleri, SGK bildirgeleri')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('employees', 'Çalışan CRUD, TCKN, departman, pozisyon')
    .addTag('payroll',   'Bordro hesaplama, onay, bordro pusulası PDF')
    .addTag('leave',     'İzin talepleri ve bakiye yönetimi')
    .addTag('sgk',       'SGK 4A bildirgesi ve muhtasar beyanname')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  await SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? '3007';
  await app.listen(parseInt(port, 10), '0.0.0.0');

  const logger = new Logger('HrService');
  logger.log(`HR Service çalışıyor: http://0.0.0.0:${port}/api/v1`);
  logger.log(`Swagger UI: http://0.0.0.0:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('HR Service başlatma hatası:', err);
  process.exit(1);
});
