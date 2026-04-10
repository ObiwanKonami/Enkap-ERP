import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { stockApi } from '@/services/stock';
import { crm } from '@/services/crm';
import SipariYeniClientPage from './siparis-yeni-client';

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = {
  title: `${t('purchaseOrder.newOrder')} — Enkap`,
  description: t('purchaseOrder.description'),
};

/**
 * Server Component — Prefetch ve hydrate ilk veriler
 *
 * Bu sayfa depolar ve tedarikçileri sunucu tarafında önceden getirir,
 * TanStack Query durumunu dehydrate eder ve istemci bileşenine iletir.
 * Bu şunları etkinleştirir:
 * - Veri içeriğiyle başlangıç HTML (SSR avantajı)
 * - İstemci tarafı etkileşimli geliştirme
 * - Azaltılmış istemci tarafı veri getirme gecikmesi
 */
export default async function SipariYeniPage() {
  // Her istek için yeni QueryClient oluştur
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 dakika
        gcTime: 10 * 60 * 1000, // 10 dakika
      },
    },
  });

  // Depoları önceden getir
  await queryClient.prefetchQuery({
    queryKey: ['warehouses'],
    queryFn: () => stockApi.warehouses.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Tedarikçileri önceden getir (vendor/supplier tipi müşteriler)
  await queryClient.prefetchQuery({
    queryKey: ['vendors'],
    queryFn: () =>
      crm.contacts.list({
        contactType: 'SUPPLIER',
        pageSize: 100,
      }),
    staleTime: 5 * 60 * 1000,
  });

  // Sorgu durumunu dehydrate et istemci tarafında yeniden kullanmak için
  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <SipariYeniClientPage />
    </HydrationBoundary>
  );
}
