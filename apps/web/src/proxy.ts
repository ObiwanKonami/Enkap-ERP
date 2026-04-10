import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { parseAcceptLanguage, isSupportedLocale, DEFAULT_LOCALE } from '@/lib/i18n';

// Cookie adı — providers.tsx ve use-locale.ts ile aynı olmalı
const LOCALE_COOKIE = 'ENKAP_LOCALE';

/**
 * Kimlik doğrulama + locale tespiti middleware'i.
 *
 * - Dashboard rotaları (/dashboard, /faturalar, /stok vb.) → oturum zorunlu
 * - /giris → oturum varsa dashboard'a yönlendir
 * - Her istekte ENKAP_LOCALE cookie'si yoksa Accept-Language'dan tespit et ve set et
 *   (flash önleme — istemci tarafında da applyToDocument() çalışır)
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Giriş veya kayıt sayfasına oturum açıkken erişim → dashboard'a yönlendir
    // Not: /platform-giris platform adminlere özgü — bu kontrole dahil edilmez
    const isTenantAuthPage = (pathname === '/giris' || pathname === '/kayit');
    if (isTenantAuthPage && token) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    const response = NextResponse.next();

    // Locale cookie yoksa Accept-Language header'ından tespit et
    const existingLocale = req.cookies.get(LOCALE_COOKIE)?.value;
    if (!existingLocale || !isSupportedLocale(existingLocale)) {
      const acceptLang = req.headers.get('accept-language');
      const detectedLocale = parseAcceptLanguage(acceptLang);

      // Cookie'yi 1 yıl için set et (istemci sonra override edebilir)
      response.cookies.set(LOCALE_COOKIE, detectedLocale, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
        httpOnly: false, // istemci tarafında okunabilmeli
      });
    }

    return response;
  },
  {
    callbacks: {
      // Token varsa yetkili kabul et
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Auth sayfaları her zaman erişilebilir
        if (pathname === '/giris' || pathname === '/platform-giris') {
          return true;
        }
        // Kayıt sayfası her zaman erişilebilir
        if (pathname === '/kayit') {
          return true;
        }
        // Şifre sıfırlama sayfası her zaman erişilebilir
        if (pathname.startsWith('/sifre-sifirla')) {
          return true;
        }
        // Platform yönetim sayfaları sadece platform admin oturumuna açık
        if (pathname.startsWith('/platform')) {
          return !!(token as { isPlatformAdmin?: boolean })?.isPlatformAdmin;
        }
        // Eski /admin rotası da platform admin gerektirir
        if (pathname.startsWith('/admin')) {
          return !!(token as { isPlatformAdmin?: boolean })?.isPlatformAdmin;
        }
        // Diğer sayfalar oturum gerektirir
        return !!token;
      },
    },
    pages: {
      signIn: '/giris',
    },
  },
);

export const config = {
  // API rotaları ve statik dosyaları hariç tut
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
