import { withAuth } from 'next-auth/middleware';
import type { NextRequestWithAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Portal güvenlik middleware'i.
 * - Oturum açılmamışsa /giris'e yönlendirir.
 * - Oturum açılmışsa / ana sayfasında portal tipine göre yönlendirir.
 * - Oturum tipine göre yanlış portala girişi engeller:
 *     customer → /siparisler erişemez (supplier-only)
 *     supplier → /odemeler, /mutabakat erişemez (customer-only)
 */
export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const pathname = req.nextUrl.pathname;
    const portalType = req.nextauth?.token?.portalType as string | undefined;

    // Ana sayfada oturum açıksa portal tipine göre yönlendir
    if (pathname === '/') {
      if (portalType === 'supplier') {
        return NextResponse.redirect(new URL('/siparisler', req.url));
      }
      if (portalType === 'customer') {
        return NextResponse.redirect(new URL('/faturalar', req.url));
      }
    }

    // Tedarikçi rotaları — sadece supplier portalı erişebilir
    const supplierOnlyRoutes = ['/siparisler'];
    // Müşteri rotaları — sadece customer portalı erişebilir
    const customerOnlyRoutes = ['/odemeler', '/mutabakat'];

    if (portalType === 'customer' && supplierOnlyRoutes.some(r => pathname.startsWith(r))) {
      return NextResponse.redirect(new URL('/faturalar', req.url));
    }

    if (portalType === 'supplier' && customerOnlyRoutes.some(r => pathname.startsWith(r))) {
      return NextResponse.redirect(new URL('/siparisler', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  // /giris, /api/auth/*, statik dosyalar hariç tüm rotaları koru
  matcher: ['/((?!giris|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
