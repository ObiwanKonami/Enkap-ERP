'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar }  from '@/components/layout/topbar';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { toast } from 'sonner';

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

/** 403 Forbidden olaylarını dinleyip toast gösterir */
function GlobalApiErrorListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const message = (e as CustomEvent<{ message: string }>).detail?.message
        ?? 'Bu işlem için yetkiniz bulunmuyor.';
      toast.error(message);
    };
    window.addEventListener('api:forbidden', handler);
    return () => window.removeEventListener('api:forbidden', handler);
  }, []);
  return null;
}

/**
 * Session hata monitörü.
 * Refresh token geçersizleşince (RefreshAccessTokenError) oturumu kapatır.
 * API interceptor'dan bağımsız, proaktif kontrol.
 */
function SessionErrorMonitor() {
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.error === 'RefreshAccessTokenError') {
      signOut({ callbackUrl: '/giris' });
    }
  }, [session?.error]);
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <GlobalApiErrorListener />
      <SessionErrorMonitor />

      {/* Shadcn Sidebar */}
      <Sidebar />

      <SidebarInset className="flex flex-col flex-1 overflow-hidden min-w-0 bg-background">
        <Topbar />
        <main
          className="no-print-nav flex-1 overflow-y-auto p-6"
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
