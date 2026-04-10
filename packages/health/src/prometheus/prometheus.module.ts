import { Module, Global } from '@nestjs/common';
import { PrometheusRegistry }    from './prometheus.registry';
import { PrometheusController }  from './prometheus.controller';

/**
 * @Global() — tüm servisler tarafından bir kez import edilir.
 *
 * PrometheusRegistry singleton olarak sağlanır; MetricsMiddleware
 * ve PrometheusController aynı Registry instance'ını kullanır.
 *
 * HealthModule ve ControlPlaneHealthModule bu modülü otomatik import eder.
 */
@Global()
@Module({
  providers:   [PrometheusRegistry],
  controllers: [PrometheusController],
  exports:     [PrometheusRegistry],
})
export class PrometheusModule {}
