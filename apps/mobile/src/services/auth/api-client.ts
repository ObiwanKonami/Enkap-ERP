import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '../../constants/api';
import { TokenManager } from './token-manager';

/** Refresh işlemi sırasında biriken istekleri tutmak için kuyruk */
type RequestQueueItem = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
const requestQueue: RequestQueueItem[] = [];

/**
 * Uygulama geneli Axios instance'ı.
 *
 * İki interceptor katmanı:
 *
 * Request interceptor:
 *  - Her istekten önce token sona erme kontrolü yapar
 *  - Sona ermek üzereyse proaktif yenileme yapar (kullanıcı 401 görmez)
 *  - Authorization: Bearer {token} header'ını otomatik ekler
 *
 * Response interceptor:
 *  - 401 aldığında refresh token ile yenileme dener
 *  - Yenileme süresince gelen istekleri kuyruğa alır (race condition önleme)
 *  - Yenileme başarısızsa logout akışını tetikler
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─── Request Interceptor ────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const credentials = await TokenManager.load();
    if (!credentials) return config;

    // Token sona ermek üzereyse proaktif yenile
    if (TokenManager.isExpiringSoon(credentials.expiresAt)) {
      try {
        const freshToken = await performTokenRefresh(credentials.refreshToken, credentials.tenantId);
        config.headers.Authorization = `Bearer ${freshToken}`;
        return config;
      } catch {
        // Proaktif yenileme başarısız — mevcut token ile devam et
        // Response interceptor 401 alırsa tekrar dener
      }
    }

    config.headers.Authorization = `Bearer ${credentials.accessToken}`;
    config.headers['X-Tenant-ID'] = credentials.tenantId;
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response Interceptor ───────────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    // 401 değilse veya zaten denendiyse ilerme
    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    if (isRefreshing) {
      // Başka bir istek zaten yenileme yapıyor — kuyruğa gir
      return new Promise<string>((resolve, reject) => {
        requestQueue.push({ resolve, reject });
      })
        .then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    isRefreshing = true;

    try {
      const credentials = await TokenManager.load();
      if (!credentials?.refreshToken) {
        throw new Error('Refresh token bulunamadı.');
      }

      const newToken = await performTokenRefresh(
        credentials.refreshToken,
        credentials.tenantId,
      );

      // Kuyruktaki tüm istekleri yeni token ile çöz
      requestQueue.forEach((item) => item.resolve(newToken));
      requestQueue.length = 0;

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Refresh başarısız — oturumu sonlandır
      requestQueue.forEach((item) => item.reject(refreshError));
      requestQueue.length = 0;

      await TokenManager.clear();

      // Uygulama katmanına çıkış sinyali gönder
      // Gerçek uygulamada: router.replace('/login') veya AuthStore.logout()
      console.error('[apiClient] Token yenileme başarısız — oturum sonlandırıldı');

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─── Token yenileme yardımcı fonksiyonu ─────────────────────────────────────

async function performTokenRefresh(
  refreshToken: string,
  tenantId: string,
): Promise<string> {
  // Bu istek interceptor'dan geçmemeli — sonsuz döngü önleme
  const response = await axios.post<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>(`${API_BASE_URL}/api/v1/auth/refresh`, { refreshToken, tenantId });

  const { accessToken, expiresIn } = response.data;
  const expiresAt = Date.now() + expiresIn * 1000;

  // Yeni token'ları kaydet
  await Promise.all([
    TokenManager.updateAccessToken(accessToken, expiresAt),
    // Yeni refresh token da güncellenmeli
    TokenManager.save({
      accessToken,
      refreshToken: response.data.refreshToken,
      tenantId,
      userId: '', // load() ile doldurulur
      expiresAt,
    }),
  ]);

  return accessToken;
}
