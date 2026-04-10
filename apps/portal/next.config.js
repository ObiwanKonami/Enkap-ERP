/** @type {import('next').NextConfig} */
const nextConfig = {
  // financial-service ve financial-service proxy — ilerleyen sprintlerde etkinleştirilecek
  async rewrites() {
    return [
      {
        source: '/api/financial/:path*',
        destination: `${process.env.FINANCIAL_SERVICE_URL ?? 'http://localhost:3003'}/api/v1/:path*`,
      },
      {
        source: '/api/purchase/:path*',
        destination: `${process.env.PURCHASE_SERVICE_URL ?? 'http://localhost:3011'}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
