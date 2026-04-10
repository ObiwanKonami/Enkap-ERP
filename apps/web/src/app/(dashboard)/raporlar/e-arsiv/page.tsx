import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { financialApi } from "@/services/financial";
import EArsivRaporlarClientPage from "./e-arsiv-client-page";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = {
  title: `${t("earsiv.title")} — Enkap`,
  description: t("earsiv.description"),
};

/**
 * Server Component — Prefetch and hydrate initial data
 *
 * This page fetches archive reports for the current month server-side,
 * dehydrates the TanStack Query state, and passes it to the client component.
 * This enables:
 * - Initial HTML with data content (SEO friendly)
 * - Progressive enhancement with client-side interactivity
 * - Reduced client-side data fetching latency
 */
export default async function EArsivRaporlarPage() {
  // Create a fresh QueryClient for this request
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      },
    },
  });

  // Get current month date range
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dateRange = {
    from: firstDay.toISOString().split('T')[0],
    to: lastDay.toISOString().split('T')[0],
  };

  // Prefetch archive reports for current month
  await queryClient.prefetchQuery({
    queryKey: ['archive-reports', dateRange.from, dateRange.to],
    queryFn: () => financialApi.archiveReports.list(dateRange),
    staleTime: 5 * 60 * 1000,
  });

  // Dehydrate the query state for client-side hydration
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <EArsivRaporlarClientPage initialMonth={now.getMonth() + 1} initialYear={now.getFullYear()} />
    </HydrationBoundary>
  );
}
