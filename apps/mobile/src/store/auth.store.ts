import { create } from 'zustand';
import { apiClient } from '../services/auth/api-client';
import { TokenManager } from '../services/auth/token-manager';
import type { LoginRequest } from '@enkap/shared-types';

interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  roles: string[];
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Akışlar
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

/**
 * Uygulama geneli kimlik doğrulama durumu.
 *
 * Zustand store — React Context'e gerek yok.
 * Her bileşen `useAuthStore()` hook'u ile duruma erişir.
 *
 * SecureStore ↔ Store senkronizasyonu:
 *  - login()           → API çağrısı → SecureStore kaydet → state güncelle
 *  - restoreSession()  → SecureStore'dan oku → state güncelle (uygulama açılışı)
 *  - logout()          → API çağrısı → SecureStore temizle → state sıfırla
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true, error: null });

    try {
      const response = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>('/api/v1/auth/login', credentials);

      const { accessToken, refreshToken, expiresIn } = response.data;

      // JWT payload'ını decode et (imza doğrulaması backend'de yapıldı)
      const payload = decodeJwtPayload(accessToken);
      if (!payload) throw new Error('Token çözümlenemedi.');

      const expiresAt = Date.now() + expiresIn * 1000;

      // SecureStore'a kaydet
      await TokenManager.save({
        accessToken,
        refreshToken,
        tenantId: payload.tenant_id,
        userId: payload.sub,
        expiresAt,
      });

      set({
        user: {
          id: payload.sub,
          email: credentials.email,
          tenantId: payload.tenant_id,
          roles: payload.user_roles,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = extractErrorMessage(err);
      set({ isLoading: false, error: message, isAuthenticated: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });

    try {
      // Backend'e çıkış bildir (token'ları geçersiz kıl)
      await apiClient.post('/api/v1/auth/logout', {}).catch(() => {
        // Çıkış API hatası kritik değil — yine de yerel temizleme yap
      });
    } finally {
      await TokenManager.clear();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  restoreSession: async () => {
    set({ isLoading: true });

    try {
      const credentials = await TokenManager.load();

      if (!credentials) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      // Token sona erdiyse ve yenilenemiyorsa oturumu temizle
      if (TokenManager.isExpiringSoon(credentials.expiresAt)) {
        // apiClient interceptor zaten yenileme yapacak — sadece durumu güncelle
      }

      const payload = decodeJwtPayload(credentials.accessToken);
      if (!payload) {
        await TokenManager.clear();
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      set({
        user: {
          id: credentials.userId,
          email: '', // Profile endpoint'ten yüklenir
          tenantId: credentials.tenantId,
          roles: payload.user_roles,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      await TokenManager.clear();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// ─── Yardımcı fonksiyonlar ───────────────────────────────────────────────────

interface DecodedJwt {
  sub: string;
  tenant_id: string;
  user_roles: string[];
  exp?: number;
  [key: string]: unknown;
}

function decodeJwtPayload(token: string): DecodedJwt | null {
  try {
    const base64Payload = token.split('.')[1];
    if (!base64Payload) return null;
    const json = atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as DecodedJwt;
  } catch {
    return null;
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Axios hata mesajı
    const axiosData = (err as { response?: { data?: { message?: string } } })
      .response?.data?.message;
    if (axiosData) return axiosData;
    return err.message;
  }
  return 'Beklenmeyen bir hata oluştu.';
}
