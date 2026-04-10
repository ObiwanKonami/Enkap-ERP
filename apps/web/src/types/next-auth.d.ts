import type { DefaultSession, DefaultJWT } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    error?: 'RefreshAccessTokenError';
    /** Platform admin oturumu mu yoksa tenant kullanıcısı mı */
    isPlatformAdmin?: boolean;
    user: {
      id:          string;
      // Tenant kullanıcısı alanları
      tenantId:    string;
      tenantTier:  string;
      roles:       string[];
      // Platform admin alanı
      platformRole?: string;
      accessToken: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    userId:              string;
    accessToken:         string;
    refreshToken:        string;
    accessTokenExpires:  number;   // Unix ms
    error?:              'RefreshAccessTokenError';
    // Tenant kullanıcısı
    tenantId:            string;
    tenantTier:          string;
    roles:               string[];
    // Platform admin
    isPlatformAdmin?:    boolean;
    platformRole?:       string;
  }
}
