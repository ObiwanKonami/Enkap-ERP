import Link from 'next/link';
import { Ghost, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-text-1 p-8">
      <div className="text-center max-w-sm space-y-5">
        <div className="flex justify-center">
          <div className="p-5 rounded-2xl bg-ink-900 border border-ink-700">
            <Ghost size={40} className="text-sky-400" />
          </div>
        </div>
        <div>
          <p className="text-6xl font-bold text-sky-400 num">404</p>
          <h1 className="text-lg font-semibold text-text-1 mt-2">Sayfa bulunamadı</h1>
          <p className="text-sm text-text-3 mt-1.5">
            Aradığınız sayfa mevcut değil veya taşınmış olabilir.
          </p>
        </div>
        <Link
          href="/"
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={14} />
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
