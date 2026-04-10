import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { initTracing } from '@enkap/health';
import { AllExceptionsFilter } from '@enkap/health';
import { AppModule } from './app.module';
import { TransformResponseInterceptor } from '@enkap/database';

async function bootstrap(): Promise<void> {
  initTracing('fleet-service'); // OTel tracing — NestFactory.create'ten ÖNCE

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

  // WebSocket adaptörü — GPS gerçek zamanlı konum yayını için
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger
  const doc = new DocumentBuilder()
    .setTitle('Fleet Service')
    .setDescription('Filo Yönetimi API — Araç, Sürücü, Sefer, Bakım, Yakıt, GPS — Enkap ERP')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  const port = process.env.PORT ?? 3017;
  await app.listen(port, '0.0.0.0');
  console.log(`fleet-service listening on :${port}`);
}

void bootstrap();
