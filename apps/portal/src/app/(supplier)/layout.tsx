'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const NAV_ITEMS = [
  {
    href: '/siparisler',
    label: 'Satın Alma Siparişleri',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/faturalar',
    label: 'Faturalarım',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const companyName = (session?.user as { companyName?: string } | undefined)?.companyName ?? 'Tedarikçi';
  const userName    = session?.user?.name ?? session?.user?.email ?? '';

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - var(--header-height))' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 12px',
          position: 'sticky',
          top: 'var(--header-height)',
          height: 'calc(100vh - var(--header-height))',
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        {/* Portal tipi etiketi */}
        <div style={{ padding: '0 8px 16px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: 8,
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#10B981', flexShrink: 0 }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#10B981' }}>Tedarikçi Portali</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{companyName}</div>
            </div>
          </div>
        </div>

        {/* Navigasyon */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="section-label" style={{ padding: '0 8px', marginBottom: 6 }}>Menü</div>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Alt kısım */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {userName && (
            <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text-3)' }}>
              {userName}
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/giris' })}
            className="nav-item"
            style={{ fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Çıkış Yap
          </button>
          <Link href="/" className="nav-item" style={{ fontSize: 12.5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <line x1="19" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="12,19 5,12 12,5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ana Sayfaya Dön
          </Link>
        </div>
      </aside>

      {/* Ana İçerik */}
      <main style={{ flex: 1, padding: '28px 32px', minWidth: 0, background: 'var(--bg)' }}>
        {children}
      </main>
    </div>
  );
}
