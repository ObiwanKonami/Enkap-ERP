/**
 * Portal API İstemcisi
 * Next.js rewrite kuralları üzerinden financial-service ve purchase-service'e erişir.
 * Tüm isteklere portal session token'ı (Authorization header) eklenir.
 */
import axios from 'axios';
import { getSession } from 'next-auth/react';

const portalClient = axios.create({
  baseURL: typeof window !== 'undefined' ? '' : 'http://localhost:3015',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Her isteğe portal JWT'yi ekle
portalClient.interceptors.request.use(async (config) => {
  const session = await getSession();
  const token = (session?.user as { portalToken?: string } | undefined)?.portalToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → giriş sayfasına yönlendir
portalClient.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/giris';
    }
    return Promise.reject(err);
  },
);

export { portalClient };
