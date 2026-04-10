import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ana Sayfa',
};

export default function PortalHomePage() {
  return (
    <main
      style={{
        minHeight: 'calc(100vh - var(--header-height))',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      {/* Hero bölümü */}
      <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 560 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--accent-bg)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
            borderRadius: 20,
            padding: '4px 14px',
            fontSize: 12,
            fontWeight: 500,
            marginBottom: 20,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" opacity="0.2" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          Self-Servis Portal
        </div>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            marginBottom: 14,
          }}
        >
          Hesabınıza hoş geldiniz
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6 }}>
          Faturalarınızı görüntüleyin, ödeme geçmişinizi takip edin ve sipariş durumunuzu kontrol edin.
        </p>
      </div>

      {/* Portal kartları */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 24,
          width: '100%',
          maxWidth: 700,
        }}
      >
        {/* Müşteri Portalı */}
        <PortalCard
          href="/faturalar"
          color="var(--accent)"
          colorBg="var(--accent-bg)"
          colorBorder="var(--accent-border)"
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="14,2 14,8 20,8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          }
          title="Müşteri Portalı"
          description="Faturalarınızı görüntüleyin, PDF olarak indirin ve ödeme geçmişinizi takip edin."
          items={['Fatura listesi ve PDF indirme', 'Ödeme geçmişi', 'Mutabakat özeti']}
          ctaText="Müşteri Portalına Gir"
        />

        {/* Tedarikçi Portalı */}
        <PortalCard
          href="/siparisler"
          color="#059669"
          colorBg="rgba(5, 150, 105, 0.08)"
          colorBorder="rgba(5, 150, 105, 0.2)"
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="3.27,6.96 12,12.01 20.73,6.96"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="12"
                y1="22.08"
                x2="12"
                y2="12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          }
          title="Tedarikçi Portalı"
          description="Satın alma siparişlerinizi görüntüleyin, teslimat durumunu takip edin ve faturalarınızı yönetin."
          items={['Satın alma siparişleri', 'Teslimat durumu takibi', 'Fatura yönetimi']}
          ctaText="Tedarikçi Portalına Gir"
        />
      </div>

      {/* Alt bilgi */}
      <div
        style={{
          marginTop: 64,
          textAlign: 'center',
          color: 'var(--text-3)',
          fontSize: 12,
        }}
      >
        <p>
          Sorun mu yaşıyorsunuz?{' '}
          <a href="mailto:destek@enkap.com.tr" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            destek@enkap.com.tr
          </a>{' '}
          adresinden bize ulaşabilirsiniz.
        </p>
        <p style={{ marginTop: 6 }}>
          © {new Date().getFullYear()} Enkap ERP · Tüm hakları saklıdır
        </p>
      </div>
    </main>
  );
}

/* ─── Portal Kart Bileşeni ────────────────────────────────────────────── */
interface PortalCardProps {
  href: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  items: string[];
  ctaText: string;
}

function PortalCard({
  href,
  color,
  colorBg,
  colorBorder,
  icon,
  title,
  description,
  items,
  ctaText,
}: PortalCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '28px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
    >
      {/* İkon */}
      <div
        style={{
          width: 56,
          height: 56,
          background: colorBg,
          border: `1px solid ${colorBorder}`,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
        }}
      >
        {icon}
      </div>

      {/* Başlık ve açıklama */}
      <div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-1)',
            marginBottom: 6,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{description}</p>
      </div>

      {/* Özellik listesi */}
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <li
            key={item}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color, flexShrink: 0 }}
            >
              <polyline
                points="20,6 9,17 4,12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {item}
          </li>
        ))}
      </ul>

      {/* CTA Butonu */}
      <Link
        href={href}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 20px',
          background: colorBg,
          color,
          border: `1px solid ${colorBorder}`,
          borderRadius: 8,
          fontSize: 13.5,
          fontWeight: 600,
          textDecoration: 'none',
          marginTop: 4,
          transition: 'opacity 0.12s',
        }}
      >
        {ctaText}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <polyline
            points="12,5 19,12 12,19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}
