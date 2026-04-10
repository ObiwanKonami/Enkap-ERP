'use client';

import { useSession } from 'next-auth/react';

export function useTenant() {
  const { data: session } = useSession();

  return {
    tenantId:   session?.user?.tenantId   ?? null,
    tenantTier: session?.user?.tenantTier ?? 'starter',
    roles:      session?.user?.roles      ?? [],
    isEnterprise: session?.user?.tenantTier === 'enterprise',
    isBusiness:   session?.user?.tenantTier === 'business',
    hasRole: (role: string) => session?.user?.roles?.includes(role) ?? false,
  };
}
