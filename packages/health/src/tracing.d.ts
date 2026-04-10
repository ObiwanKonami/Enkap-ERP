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
export declare function initTracing(serviceName: string, version?: string): void;
