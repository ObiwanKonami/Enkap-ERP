import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { initTracing, AllExceptionsFilter } from '@enkap/health';
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from '@enkap/database';

async function bootstrap(): Promise<void> {
  initTracing('waybill-service'); // OTel tracing — NestFactory.create'ten ÖNCE

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

  const doc = new DocumentBuilder()
    .setTitle('Waybill Service')
    .setDescription('e-İrsaliye API — Enkap ERP (SATIŞ / ALIŞ / TRANSFER / İADE)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  const port = process.env['PORT'] ?? 3018;
  await app.listen(port, '0.0.0.0');
  console.log(`waybill-service listening on :${port}`);
}

void bootstrap();
