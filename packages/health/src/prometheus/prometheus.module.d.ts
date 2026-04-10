/**
 * @Global() — tüm servisler tarafından bir kez import edilir.
 *
 * PrometheusRegistry singleton olarak sağlanır; MetricsMiddleware
 * ve PrometheusController aynı Registry instance'ını kullanır.
 *
 * HealthModule ve ControlPlaneHealthModule bu modülü otomatik import eder.
 */
export declare class PrometheusModule {
}
