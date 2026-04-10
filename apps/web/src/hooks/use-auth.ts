'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const logout = useCallback(async () => {
    await signOut({ redirect: false });
    router.replace('/giris');
  }, [router]);

  return {
    user:          session?.user ?? null,
    accessToken:   session?.user?.accessToken ?? null,
    isLoading:     status === 'loading',
    isAuthenticated: status === 'authenticated',
    logout,
  };
}
