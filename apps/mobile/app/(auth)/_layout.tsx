import { Stack } from 'expo-router';

/** Auth grup layout — başlık gizli (giriş ekranı tam sayfa) */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
