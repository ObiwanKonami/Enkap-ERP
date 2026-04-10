"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initTracing = initTracing;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const exporter_trace_otlp_grpc_1 = require("@opentelemetry/exporter-trace-otlp-grpc");
const instrumentation_http_1 = require("@opentelemetry/instrumentation-http");
const instrumentation_pg_1 = require("@opentelemetry/instrumentation-pg");
let sdk = null;
function initTracing(serviceName, version = '1.0.0') {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    // Tracing devre dışı bırakılabilir (geliştirme ortamı)
    if (!endpoint || process.env.OTEL_DISABLED === 'true') {
        return;
    }
    const exporter = new exporter_trace_otlp_grpc_1.OTLPTraceExporter({ url: endpoint });
    sdk = new sdk_node_1.NodeSDK({
        resource: new resources_1.Resource({
            [semantic_conventions_1.SEMRESATTRS_SERVICE_NAME]: serviceName,
            [semantic_conventions_1.SEMRESATTRS_SERVICE_VERSION]: version,
            'deployment.environment': process.env.NODE_ENV ?? 'development',
        }),
        traceExporter: exporter,
        instrumentations: [
            new instrumentation_http_1.HttpInstrumentation({
                // Sağlık kontrol endpoint'lerini trace etme (gürültü azaltma)
                ignoreIncomingRequestHook: (req) => req.url?.startsWith('/health') ?? false,
            }),
            new instrumentation_pg_1.PgInstrumentation({
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
