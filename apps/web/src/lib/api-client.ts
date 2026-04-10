/**
 * API İstemci — BFF Proxy üzerinden microservice erişimi.
 *
 * Client bileşenlerinde:
 *   import { apiClient } from '@/lib/api-client';
 *   apiClient.get('/financial/invoices')
 *
 * Server bileşenlerinde:
 *   import { serverFetch } from '@/lib/api-client';
 *   serverFetch('financial', '/invoices', accessToken)
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';

// Axios config'e retry flag ekle
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retried?: boolean;
  }
}

// ─── Client Axios (BFF Proxy üzerinden) ────────────────────────────────────

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Her istekte güncel session'dan Bearer token al
apiClient.interceptors.request.use(async (config) => {
  const session = await getSession();
  if (session?.user.accessToken) {
    config.headers.Authorization = `Bearer ${session.user.accessToken}`;
  }
  return config;
});

// 401 → refresh token ile taze token al, isteği bir kez daha dene
// 403 → toast bildirimi (GlobalApiErrorListener dinler)
// NOT: signOut ASLA burada çağrılmaz; SessionErrorMonitor session.error'ı izler
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;

    if (status === 401 && error.config && !error.config._retried) {
      error.config._retried = true;

      // getSession() → /api/auth/session → jwt callback çalışır.
      // auth.ts token süresini kontrol eder; dolmuşsa refresh dener.
      const session = await getSession();

      // Refresh token da geçersiz → SessionErrorMonitor signOut yapacak
      if (session?.error === 'RefreshAccessTokenError') {
        await signOut({ callbackUrl: '/giris' });
        return Promise.reject(error);
      }

      if (!session?.user?.accessToken) {
        // Hiç oturum yok — sessizce reddet, middleware yönlendirecek
        return Promise.reject(error);
      }

      // Taze token varsa aynı isteği tekrar dene
      error.config.headers = {
        ...error.config.headers,
        Authorization: `Bearer ${session.user.accessToken}`,
      };
      return apiClient.request(error.config);
    }

    // Retry de 401 → backend'in gerçek 401'i (yetki sorunu değil, API hatası)
    // signOut YAPMA — UI demo/fallback gösterir; oturum kendiliğinden kapanmaz
    // (SessionErrorMonitor zaten session.error'ı izliyor)

    if (status === 403) {
      const message: string =
        error.response?.data?.message ?? 'Bu işlem için yetkiniz bulunmuyor.';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('api:forbidden', { detail: { message } }));
      }
    }

    return Promise.reject(error);
  },
);

// ─── Server Component Fetch ─────────────────────────────────────────────────

const SERVER_URLS: Record<string, string> = {
  financial:     process.env.FINANCIAL_SERVICE_URL      ?? 'http://localhost:3003',
  stock:         process.env.STOCK_SERVICE_URL          ?? 'http://localhost:3004',
  hr:            process.env.HR_SERVICE_URL             ?? 'http://localhost:3007',
  crm:           process.env.CRM_SERVICE_URL            ?? 'http://localhost:3009',
  billing:       process.env.BILLING_SERVICE_URL        ?? 'http://localhost:3008',
  analytics:     process.env.ANALYTICS_SERVICE_URL      ?? 'http://localhost:3010',
  tenant:        process.env.TENANT_SERVICE_URL         ?? 'http://localhost:3002',
  auth:          process.env.AUTH_SERVICE_URL           ?? 'http://localhost:3001',
  treasury:      process.env.TREASURY_SERVICE_URL       ?? 'http://localhost:3013',
  purchase:      process.env.PURCHASE_SERVICE_URL       ?? 'http://localhost:3011',
  order:         process.env.ORDER_SERVICE_URL          ?? 'http://localhost:3012',
  manufacturing: process.env.MANUFACTURING_SERVICE_URL  ?? 'http://localhost:3014',
};

/**
 * Server component'lerden servis çağrısı.
 * @param service  'financial' | 'stock' | 'hr' | 'crm' | 'billing' | 'analytics' | 'tenant'
 * @param path     '/invoices?limit=20'
 * @param token    getServerSession()'dan gelen accessToken
 */
export async function serverFetch<T>(
  service: string,
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const base = SERVER_URLS[service] ?? SERVER_URLS['financial']!;
  const url  = `${base}/api/v1${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options?.headers,
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`${service} servis hatası: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}
