import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { purchaseApi } from '@/services/purchase';
import { stockApi } from '@/services/stock';
import { SipariDetayClientPage } from './siparis-detay-client';

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = {
  title: `${t('purchase.title')} — Enkap`,
  description: t('purchase.subtitle'),
};

/**
 * Server Component — Prefetch ve hydrate satın alma siparişi detayları
 *
 * Bu sayfa satın alma siparişini ve depoları sunucu tarafında önceden getirir,
 * TanStack Query durumunu dehydrate eder ve istemci bileşenine iletir.
 */
export default async function SipariDetayPage({ params }: { params: { id: string } }) {
  // Her istek için yeni QueryClient oluştur
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 dakika
        gcTime: 10 * 60 * 1000, // 10 dakika
      },
    },
  });

  try {
    // Satın alma siparişini önceden getir
    await queryClient.prefetchQuery({
      queryKey: ['po', params.id],
      queryFn: () => purchaseApi.get(params.id),
      staleTime: 5 * 60 * 1000,
    });

    // Depoları önceden getir
    await queryClient.prefetchQuery({
      queryKey: ['warehouses'],
      queryFn: () => stockApi.warehouses.list(),
      staleTime: 5 * 60 * 1000,
    });
  } catch (error) {
    // Hata durumunda client tarafında işlem yapılır
    console.error('Failed to prefetch data:', error);
  }

  // Sorgu durumunu dehydrate et istemci tarafında yeniden kullanmak için
  const dehydratedState = dehydrate(queryClient);

  // Depoları direkt getirelim
  let warehouses: Array<{ id: string; name: string }> = [];
  try {
    const warehousesData = await stockApi.warehouses.list();
    warehouses = warehousesData;
  } catch (error) {
    console.error('Failed to fetch warehouses:', error);
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <SipariDetayClientPage warehouses={warehouses} />
    </HydrationBoundary>
  );
}
