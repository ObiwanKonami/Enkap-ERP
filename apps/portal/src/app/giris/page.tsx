'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const errorParam = params.get('error');

  const [email, setEmail]           = useState('');
  const [token, setToken]           = useState('');
  const [portalType, setPortalType] = useState<'customer' | 'supplier'>('customer');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(errorParam ? 'Giriş bilgileri hatalı.' : '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('portal-credentials', {
      email,
      token,
      portalType,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError('E-posta veya davet kodu hatalı. Lütfen tekrar deneyin.');
      return;
    }

    // Portal tipine göre yönlendir
    if (portalType === 'customer') {
      router.replace('/faturalar');
    } else {
      router.replace('/siparisler');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              background: 'var(--accent)',
              borderRadius: 16,
              marginBottom: 16,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
              <polyline
                points="9,22 9,12 15,12 15,22"
                stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
            Self-Servis Portal
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
            Davet e-postanızdaki kodu girerek giriş yapın
          </p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: '28px 32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Portal Tipi Seçimi */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>
                Portal Tipi
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['customer', 'supplier'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPortalType(type)}
                    style={{
                      padding: '10px',
                      borderRadius: 8,
                      border: `1px solid ${portalType === type ? 'var(--accent)' : 'var(--border)'}`,
                      background: portalType === type ? 'var(--accent-bg)' : 'transparent',
                      color: portalType === type ? 'var(--accent)' : 'var(--text-2)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {type === 'customer' ? '🤝 Müşteri' : '🏭 Tedarikçi'}
                  </button>
                ))}
              </div>
            </div>

            {/* E-posta */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                E-posta Adresi
              </label>
              <input
                type="email"
                className="input"
                style={{ width: '100%' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@firma.com"
                required
                autoFocus
              />
            </div>

            {/* Davet Kodu */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
                Davet Kodu
              </label>
              <input
                type="text"
                className="input num"
                style={{ width: '100%', letterSpacing: '0.15em' }}
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4"
                required
                maxLength={32}
              />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
                Davet e-postanızda bulunan kodu girin
              </div>
            </div>

            {/* Hata mesajı */}
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  fontSize: 13,
                  color: '#F87171',
                }}
              >
                {error}
              </div>
            )}

            {/* Giriş butonu */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !email || !token}
              style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600 }}
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>

        {/* Alt bilgi */}
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 20 }}>
          Davet kodu almadıysanız yetkili firmayla iletişime geçin.
        </p>
      </div>
    </div>
  );
}

export default function GirisPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
