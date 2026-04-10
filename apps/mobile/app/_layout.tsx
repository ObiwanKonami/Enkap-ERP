import '../src/i18n'; // i18next başlat — diğer her şeyden önce
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuthStore } from '../src/store/auth.store';

/**
 * Root Layout — Expo Router v4.
 *
 * Sorumluluklar:
 *  - GestureHandlerRootView: react-native-gesture-handler (BottomSheet vb. için zorunlu)
 *  - i18n başlatma (import ile tetiklenir)
 *  - Oturum geri yükleme: SecureStore'dan token yükle, geçerliyse (tabs)'a yönlendir
 *  - StatusBar: koyu tema
 *
 * Auth akışı:
 *  ├── (auth)/login  → Giriş yapılmamış kullanıcılar
 *  └── (tabs)/       → Giriş yapmış kullanıcılar (TenantGuard korumalı API'ler)
 */
export default function RootLayout() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  // Uygulama başlangıcında kayıtlı oturumu geri yükle
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" backgroundColor="#0f172a" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0f172a' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="invoices/[id]"
          options={{ title: 'Fatura Detayı', headerBackTitle: '' }}
        />
        <Stack.Screen
          name="stock/[id]"
          options={{ title: 'Ürün Detayı', headerBackTitle: '' }}
        />
        <Stack.Screen
          name="stock/new"
          options={{ title: 'Yeni Ürün', presentation: 'modal' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
