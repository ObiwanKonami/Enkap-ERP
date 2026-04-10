'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hata loglama — üretimde Sentry/OTel'e gönderilebilir
    console.error('[Error Boundary]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="text-center max-w-sm space-y-5">
        <div className="flex justify-center">
          <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle size={36} className="text-rose-400" />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-text-1">Bir hata oluştu</h1>
          <p className="text-sm text-text-3 mt-1.5">
            Bu sayfa beklenmedik bir sorunla karşılaştı. Lütfen tekrar deneyin.
          </p>
          {error.digest && (
            <p className="text-[10px] text-text-3 mt-2 ">
              Hata kodu: {error.digest}
            </p>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            <RefreshCw size={13} />
            Tekrar Dene
          </button>
          <Link href="/" className="btn-ghost text-sm inline-flex items-center gap-2">
            <ArrowLeft size={13} />
            Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}
