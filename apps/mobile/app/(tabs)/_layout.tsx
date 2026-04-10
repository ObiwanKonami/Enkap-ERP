import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/store/auth.store';
import { useSyncStore } from '../../src/store/sync.store';

// Tab ikonları — tek bağımlılık olmaması için emoji kullanıyoruz
// Üretimde: react-native-vector-icons veya expo/vector-icons
const ICONS = {
  dashboard: '📊',
  invoices: '🧾',
  stock: '📦',
  scanner: '📷',
} as const;

/**
 * Tab Navigator Layout + Auth Guard.
 *
 * Auth guard mantığı:
 *  - isAuthenticated=false → /login'e yönlendir
 *  - Expo Router'da redirect useEffect içinde yapılır (render sırasında değil)
 *
 * Otomatik senkronizasyon:
 *  - Tab açıldığında arka planda sync başlatılır (kullanıcı görmez)
 *  - Başarısız olursa sessizce geçer (offline kullanım devam eder)
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sync = useSyncStore((s) => s.sync);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated]);

  // Arka plan senkronizasyonu — uygulama açıldığında
  useEffect(() => {
    if (isAuthenticated) {
      void sync();
    }
  }, [isAuthenticated, sync]);

  if (!isAuthenticated) return null;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: '#1e293b',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#475569',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f1f5f9',
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color }) => (
            <TabIcon icon={ICONS.dashboard} color={color} />
          ),
          headerTitle: 'Enkap ERP',
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: t('tabs.invoices'),
          tabBarIcon: ({ color }) => (
            <TabIcon icon={ICONS.invoices} color={color} />
          ),
          headerTitle: t('invoice.title'),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t('tabs.stock'),
          tabBarIcon: ({ color }) => (
            <TabIcon icon={ICONS.stock} color={color} />
          ),
          headerTitle: t('stock.title'),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: t('tabs.scanner'),
          tabBarIcon: ({ color }) => (
            <TabIcon icon={ICONS.scanner} color={color} />
          ),
          headerTitle: t('scanner.title'),
          headerShown: false, // Tam ekran kamera
        }}
      />
    </Tabs>
  );
}

/** Basit emoji ikon bileşeni */
function TabIcon({ icon, color }: { icon: string; color: string }) {
  // opacity renk kodlaması için opak göster
  void color; // renk efekti tabBarActiveTintColor ile yönetiliyor
  return (
    <React.Fragment>
      {/* Gerçek projede: <Ionicons name="..." size={24} color={color} /> */}
      {/* eslint-disable-next-line react-native/no-inline-styles */}
      <React.Fragment>{icon}</React.Fragment>
    </React.Fragment>
  );
}
