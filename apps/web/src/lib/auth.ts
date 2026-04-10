import type { NextAuthOptions, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 saat
const REFRESH_BUFFER_MS   = 60 * 1_000;     // 1 dakika önce yenile

// ─── Tenant kullanıcısı token yenileme ───────────────────────────────────────

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const { data } = await axios.post<{ accessToken: string; refreshToken?: string }>(
      `${AUTH_SERVICE_URL}/api/v1/auth/refresh`,
      { refreshToken: token.refreshToken, tenantId: token.tenantId },
      { timeout: 8_000 },
    );

    return {
      ...token,
      accessToken:        data.accessToken,
      refreshToken:       data.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_TTL_MS,
      error:              undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

// ─── Platform admin token yenileme ────────────────────────────────────────────

async function refreshPlatformToken(token: JWT): Promise<JWT> {
  try {
    const { data } = await axios.post<{ accessToken: string; refreshToken?: string }>(
      `${AUTH_SERVICE_URL}/api/v1/auth/platform/refresh`,
      { refreshToken: token.refreshToken },
      { timeout: 8_000 },
    );

    return {
      ...token,
      accessToken:        data.accessToken,
      refreshToken:       data.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_TTL_MS,
      error:              undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

// ─── NextAuth Yapılandırması ──────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    // Tenant kullanıcısı girişi
    CredentialsProvider({
      id:   'credentials',
      name: 'Enkap ERP',
      credentials: {
        email:      { label: 'E-posta',    type: 'email' },
        password:   { label: 'Şifre',      type: 'password' },
        tenantSlug: { label: 'Firma Kodu', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const { data } = await axios.post<TenantLoginResponse>(
            `${AUTH_SERVICE_URL}/api/v1/auth/login`,
            {
              email:      credentials.email,
              password:   credentials.password,
              tenantSlug: credentials.tenantSlug,
            },
          );

          return {
            id:           data.userId,
            email:        credentials.email,
            tenantId:     data.tenantId,
            tenantTier:   data.tenantTier ?? 'starter',
            roles:        data.roles ?? [],
            accessToken:  data.accessToken,
            refreshToken: data.refreshToken,
            isPlatformAdmin: false,
          } as User & EnkapUser;
        } catch {
          return null;
        }
      },
    }),

    // Platform admin girişi — tenant slug gerektirmez
    CredentialsProvider({
      id:   'platform',
      name: 'Enkap Platform Admin',
      credentials: {
        email:    { label: 'E-posta', type: 'email' },
        password: { label: 'Şifre',   type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const { data } = await axios.post<PlatformLoginResponse>(
            `${AUTH_SERVICE_URL}/api/v1/auth/platform/login`,
            { email: credentials.email, password: credentials.password },
          );

          return {
            id:              data.adminId,
            email:           data.email,
            platformRole:    data.platformRole,
            accessToken:     data.accessToken,
            refreshToken:    data.refreshToken,
            isPlatformAdmin: true,
            // Tenant alanları boş — platform adminin tenant'ı yok
            tenantId:    '',
            tenantTier:  '',
            roles:       [],
          } as User & EnkapUser;
        } catch {
          return null;
        }
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },

  callbacks: {
    async jwt({ token, user }) {
      // İlk giriş
      if (user) {
        const u = user as User & EnkapUser;
        return {
          ...token,
          userId:             u.id,
          tenantId:           u.tenantId,
          tenantTier:         u.tenantTier,
          roles:              u.roles,
          isPlatformAdmin:    u.isPlatformAdmin,
          platformRole:       u.platformRole,
          accessToken:        u.accessToken,
          refreshToken:       u.refreshToken,
          accessTokenExpires: Date.now() + ACCESS_TOKEN_TTL_MS,
        };
      }

      if (!token.accessTokenExpires) return token;

      // Token hâlâ geçerli
      if (Date.now() < token.accessTokenExpires - REFRESH_BUFFER_MS) return token;

      // Süresi doldu — provider'a göre farklı endpoint
      return token.isPlatformAdmin
        ? refreshPlatformToken(token)
        : refreshAccessToken(token);
    },

    async session({ session, token }) {
      session.isPlatformAdmin      = token.isPlatformAdmin;
      session.user.id              = token.userId;
      session.user.accessToken     = token.accessToken;
      session.user.tenantId        = token.tenantId;
      session.user.tenantTier      = token.tenantTier;
      session.user.roles           = token.roles;
      session.user.platformRole    = token.platformRole;
      if (token.error) session.error = token.error;
      return session;
    },
  },

  pages: {
    signIn: '/giris',
    error:  '/giris',
  },
};

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface TenantLoginResponse {
  userId:       string;
  tenantId:     string;
  tenantTier?:  string;
  roles?:       string[];
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;
}

interface PlatformLoginResponse {
  adminId:      string;
  email:        string;
  platformRole: string;
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;
}

interface EnkapUser {
  tenantId:        string;
  tenantTier:      string;
  roles:           string[];
  isPlatformAdmin: boolean;
  platformRole?:   string;
  accessToken:     string;
  refreshToken:    string;
}
