/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        const svc = (envVar, fallback) => process.env[envVar] ?? fallback;

        const rules = [
            // Auth Service (3001)
            {
                source: '/api/auth-svc/:path*',
                destination: `${svc('AUTH_SERVICE_URL', 'http://localhost:3001')}/api/v1/:path*`,
            },
            // Tenant Service (3002)
            {
                source: '/api/tenant/:path*',
                destination: `${svc('TENANT_SERVICE_URL', 'http://localhost:3002')}/api/v1/:path*`,
            },
            // Financial Service (3003)
            {
                source: '/api/financial/:path*',
                destination: `${svc('FINANCIAL_SERVICE_URL', 'http://localhost:3003')}/api/v1/:path*`,
            },
            // Stock Service (3004)
            {
                source: '/api/stock/:path*',
                destination: `${svc('STOCK_SERVICE_URL', 'http://localhost:3004')}/api/v1/:path*`,
            },
            // Webhook Hub (3006)
            {
                source: '/api/webhook-hub/:path*',
                destination: `${svc('WEBHOOK_HUB_URL', 'http://localhost:3006')}/api/v1/:path*`,
            },
            // HR Service (3007)
            {
                source: '/api/hr/:path*',
                destination: `${svc('HR_SERVICE_URL', 'http://localhost:3007')}/api/v1/:path*`,
            },
            // Billing Service (3008)
            {
                source: '/api/billing/:path*',
                destination: `${svc('BILLING_SERVICE_URL', 'http://localhost:3008')}/api/v1/:path*`,
            },
            // CRM Service (3009)
            {
                source: '/api/crm/:path*',
                destination: `${svc('CRM_SERVICE_URL', 'http://localhost:3009')}/api/v1/:path*`,
            },
            // Analytics Service (3010)
            {
                source: '/api/analytics/:path*',
                destination: `${svc('ANALYTICS_SERVICE_URL', 'http://localhost:3010')}/api/v1/:path*`,
            },
            // Purchase Service (3011)
            {
                source: '/api/purchase/:path*',
                destination: `${svc('PURCHASE_SERVICE_URL', 'http://localhost:3011')}/api/v1/:path*`,
            },
            // Order Service (3012)
            {
                source: '/api/order/:path*',
                destination: `${svc('ORDER_SERVICE_URL', 'http://localhost:3012')}/api/v1/:path*`,
            },
            // Treasury Service (3013)
            {
                source: '/api/treasury/:path*',
                destination: `${svc('TREASURY_SERVICE_URL', 'http://localhost:3013')}/api/v1/:path*`,
            },
            // Manufacturing Service (3014)
            {
                source: '/api/manufacturing/:path*',
                destination: `${svc('MANUFACTURING_SERVICE_URL', 'http://localhost:3014')}/api/v1/:path*`,
            },
            // Fleet Service (3017)
            {
                source: '/api/fleet/:path*',
                destination: `${svc('FLEET_SERVICE_URL', 'http://localhost:3017')}/api/v1/:path*`,
            },
            // Waybill Service (3018)
            {
                source: '/api/waybill/:path*',
                destination: `${svc('WAYBILL_SERVICE_URL', 'http://localhost:3018')}/api/v1/:path*`,
            },
            // Notification Service (3019)
            {
                source: '/api/notification/:path*',
                destination: `${svc('NOTIFICATION_SERVICE_URL', 'http://localhost:3019')}/api/v1/:path*`,
            },
        ];
        return { beforeFiles: rules };
    },
};

export default nextConfig
