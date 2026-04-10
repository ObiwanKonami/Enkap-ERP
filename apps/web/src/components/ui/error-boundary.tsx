'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Props {
  children:  ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?:   Error;
}

// ─── ErrorBoundary ─────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <DefaultFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: undefined })}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Varsayılan hata ekranı ────────────────────────────────────────────────

function DefaultFallback({ error, onReset }: { error?: Error; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-5 p-8 text-center">
      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
        <AlertTriangle size={32} className="text-rose-400" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h2 className="text-base font-semibold text-text-1">Beklenmeyen bir hata oluştu</h2>
        {error?.message && (
          <p className="text-xs text-text-3 bg-ink-800/60 px-3 py-2 rounded-lg border border-ink-700 break-words">
            {error.message}
          </p>
        )}
        <p className="text-xs text-text-3">
          Sayfayı yenilemeyi veya farklı bir işlem yapmayı deneyin.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onReset}
          className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5"
        >
          <RefreshCw size={12} />
          Yeniden Dene
        </button>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary h-8 px-3 text-xs"
        >
          Sayfayı Yenile
        </button>
      </div>
    </div>
  );
}
