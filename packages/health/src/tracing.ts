/**
 * OpenTelemetry Distributed Tracing Bootstrap.
 *
 * Her servisin main.ts'inden `bootstrap()` ÇAĞRILMADAN ÖNCE import edilmeli:
 *
 *   import { initTracing } from '@enkap/health/tracing';
 *   initTracing('auth-service');
 *   // sonra NestFactory.create(...)
 *
 * Bu sıra kritik — NestJS bootstrap'tan önce instrumentasyon kurulmalı.
 *
 * Desteklenen exporter'lar (OTEL_EXPORTER_OTLP_ENDPOINT env ile):
 *   - OTLP/gRPC → Jaeger, Grafana Tempo, OpenTelemetry Collector
 *
 * Örnek Collector URL: http://otel-collector.enkap-production.svc.cluster.local:4317
 */

import { NodeSDK }              from '@opentelemetry/sdk-node';
import { Resource }             from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION }
  from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter }   from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation }  from '@opentelemetry/instrumentation-http';
import { PgInstrumentation }    from '@opentelemetry/instrumentation-pg';

let sdk: NodeSDK | null = null;

export function initTracing(serviceName: string, version = '1.0.0'): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // Tracing devre dışı bırakılabilir (geliştirme ortamı)
  if (!endpoint || process.env.OTEL_DISABLED === 'true') {
    return;
  }

  const exporter = new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]:    serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: version,
      'deployment.environment':      process.env.NODE_ENV ?? 'development',
    }),
    traceExporter:   exporter,
    instrumentations: [
      new HttpInstrumentation({
        // Sağlık kontrol endpoint'lerini trace etme (gürültü azaltma)
        ignoreIncomingRequestHook: (req) =>
          req.url?.startsWith('/health') ?? false,
      }),
      new PgInstrumentation({
        // SQL sorgularını span attribute olarak kaydet
        enhancedDatabaseReporting: true,
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown — trace'leri flush et
  process.on('SIGTERM', async () => {
    await sdk?.shutdown().catch(console.error);
  });
}
