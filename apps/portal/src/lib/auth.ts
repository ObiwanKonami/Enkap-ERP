/**
 * Portal NextAuth Konfigürasyonu
 * Müşteri ve tedarikçiler e-posta + davet kodu ile giriş yapar.
 * auth-service: POST /api/v1/portal/auth/login
 */
import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'portal-credentials',
      name: 'Portal Girişi',
      credentials: {
        email:      { label: 'E-posta',     type: 'email'    },
        token:      { label: 'Davet Kodu',  type: 'text'     },
        portalType: { label: 'Portal Tipi', type: 'text'     }, // 'customer' | 'supplier'
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.token) return null;

        try {
          const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/portal/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              email:      credentials.email,
              token:      credentials.token,
              portalType: credentials.portalType ?? 'customer',
            }),
          });

          if (!res.ok) return null;

          const data = (await res.json()) as {
            accessToken: string;
            contactId:   string;
            tenantId:    string;
            name:        string;
            email:       string;
            portalType:  'customer' | 'supplier';
            companyName: string;
          };

          return {
            id:          data.contactId,
            email:       data.email,
            name:        data.name,
            portalToken: data.accessToken,
            contactId:   data.contactId,
            tenantId:    data.tenantId,
            portalType:  data.portalType,
            companyName: data.companyName,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.portalToken  = (user as unknown as Record<string, unknown>).portalToken as string;
        token.contactId    = (user as unknown as Record<string, unknown>).contactId   as string;
        token.tenantId     = (user as unknown as Record<string, unknown>).tenantId    as string;
        token.portalType   = (user as unknown as Record<string, unknown>).portalType  as string;
        token.companyName  = (user as unknown as Record<string, unknown>).companyName as string;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as Record<string, unknown>).portalToken  = token.portalToken;
      (session.user as Record<string, unknown>).contactId    = token.contactId;
      (session.user as Record<string, unknown>).tenantId     = token.tenantId;
      (session.user as Record<string, unknown>).portalType   = token.portalType;
      (session.user as Record<string, unknown>).companyName  = token.companyName;
      return session;
    },
  },

  pages: {
    signIn:  '/giris',
    error:   '/giris',
  },

  session: {
    strategy: 'jwt',
    maxAge:   7 * 24 * 60 * 60, // 7 gün
  },

  secret: process.env.NEXTAUTH_SECRET ?? 'portal-secret-change-in-production',
};
