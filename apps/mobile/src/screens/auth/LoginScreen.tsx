import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '../../store/auth.store';

/**
 * Giriş ekranı.
 *
 * Özellikler:
 *  - E-posta / şifre / firma kodu girişi
 *  - Biyometrik doğrulama (Face ID / Parmak izi) — kayıtlı oturum için
 *  - Hata mesajları Türkçe
 *  - Klavye kaçınma (iOS / Android uyumlu)
 *
 * Bileşen kasıtlı olarak sade tutulmuştur — stil sistemi (NativeWind vb.)
 * ve form kütüphanesi (react-hook-form) gerçek implementasyonda eklenecek.
 */
export default function LoginScreen() {
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password || !tenantSlug.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm alanları doldurun.');
      return;
    }

    clearError();

    try {
      await login({ email: email.trim().toLowerCase(), password, tenantSlug });
      // Başarılı giriş: Expo Router otomatik yönlendirir
      // (_layout.tsx'teki isAuthenticated kontrolü devreye girer)
    } catch {
      // Hata useAuthStore'da state'e yazıldı — UI zaten gösterecek
    }
  };

  const handleBiometricLogin = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      Alert.alert(
        'Biyometrik Doğrulama',
        'Cihazınızda kayıtlı biyometrik kimlik bulunamadı.',
      );
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enkap ERP\'e giriş yapmak için doğrulayın',
      fallbackLabel: 'Şifre kullan',
      cancelLabel: 'İptal',
    });

    if (result.success) {
      // Biyometrik başarılı → SecureStore'dan token'ı restore et
      // (önceki oturum bilgileri kullanılır)
      const { restoreSession } = useAuthStore.getState();
      await restoreSession();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        {/* Logo / Başlık */}
        <View style={styles.header}>
          <Text style={styles.logo}>enkap</Text>
          <Text style={styles.subtitle}>ERP Platformu</Text>
        </View>

        {/* Hata mesajı */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Firma Kodu</Text>
          <TextInput
            style={styles.input}
            value={tenantSlug}
            onChangeText={setTenantSlug}
            placeholder="ornek-firma"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            editable={!isLoading}
          />

          <Text style={styles.label}>E-posta</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="ad@firma.com"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            editable={!isLoading}
          />

          <Text style={styles.label}>Şifre</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Giriş butonu */}
        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          )}
        </TouchableOpacity>

        {/* Biyometrik giriş */}
        <TouchableOpacity
          style={styles.biometricButton}
          onPress={handleBiometricLogin}
          disabled={isLoading}
        >
          <Text style={styles.biometricText}>
            🔐  Biyometrik ile Giriş
          </Text>
        </TouchableOpacity>

        {/* Alt bilgi */}
        <Text style={styles.footer}>
          Şifrenizi mi unuttunuz?{' '}
          <Text style={styles.footerLink}>Sıfırla</Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Stiller ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E3A5F',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  form: {
    gap: 4,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 12,
  },
  eyeIcon: {
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#1E3A5F',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  biometricButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  biometricText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#6B7280',
  },
  footerLink: {
    color: '#1E3A5F',
    fontWeight: '600',
  },
});
