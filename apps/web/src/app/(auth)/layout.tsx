export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
           style={{ background: 'radial-gradient(ellipse at center, rgba(14,165,233,0.06) 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-[480px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM11 11a2 2 0 100-4 2 2 0 000 4z" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span className="text-lg font-bold text-[var(--text-1)]" style={{ fontFamily: "'Syne', sans-serif" }}>
              Enkap
            </span>
          </div>
          <p className="text-xs text-slate-500 tracking-wide">KURUMSAL ERP PLATFORMU</p>
        </div>

        {children}

        <p className="text-center text-xs text-slate-600 mt-6">
          Tüm veriler Türkiye sunucularında · KVKK uyumlu
        </p>
      </div>
    </div>
  );
}
