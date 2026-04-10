import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  type CodeScannerFrame,
} from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { getDatabase, LocalProduct } from '../../database';

/**
 * Barkod Tarama Ekranı — VisionCamera v4.
 *
 * Desteklenen formatlar: ean-13, ean-8, qr, data-matrix, code-128, code-39
 * Barkod okunduğunda:
 *  1. Yerel WatermelonDB'de ürün aranır (hız için)
 *  2. Bulunamazsa backend'e sorgu atılır
 *  3. Ürün bulunursa detay/stok hareketi sayfasına yönlendir
 *
 * Güvenlik: Kamera izni yoksa ayarlar sayfasına yönlendir.
 * Performans: useCodeScanner memoize edilmiş — her frame yeniden oluşturulmaz.
 */
export default function ScannerScreen() {
  const { t } = useTranslation();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scanCooldown = useRef(false);

  const device = useCameraDevice('back');

  // Kamera izni kontrolü
  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    // Cooldown: aynı barkodu 2 saniye içinde tekrar işleme
    if (scanCooldown.current || isSearching || barcode === lastScanned) return;
    scanCooldown.current = true;
    setTimeout(() => { scanCooldown.current = false; }, 2000);

    setIsSearching(true);
    setLastScanned(barcode);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // Önce yerel DB'de ara
      const localProducts = await getDatabase()
        .get<LocalProduct>('products')
        .query(Q.where('barcode', barcode))
        .fetch();

      if (localProducts.length > 0) {
        const product = localProducts[0];
        router.push({
          pathname: '/stock/[id]',
          params: { id: product.id, barcode },
        });
        return;
      }

      // Yerel bulunamadı — bildirim göster
      Alert.alert(
        t('scanner.found'),
        t('scanner.notFound', { barcode }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'Ürün Oluştur',
            onPress: () => router.push({ pathname: '/stock/new', params: { barcode } }),
          },
        ],
      );
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, lastScanned, t]);

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'qr', 'data-matrix', 'code-128', 'code-39'],
    onCodeScanned: (codes: Parameters<Parameters<typeof useCodeScanner>[0]['onCodeScanned']>[0]) => {
      const code = codes[0];
      if (code?.value) {
        void handleBarcodeDetected(code.value);
      }
    },
  });

  // İzin durumu yükleniyor
  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  // İzin reddedildi
  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>{t('scanner.permissionRequired')}</Text>
        <Pressable
          style={styles.permissionBtn}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.permissionBtnText}>{t('scanner.permissionButton')}</Text>
        </Pressable>
      </View>
    );
  }

  // Kamera yok (simülatör vb.)
  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Kamera bulunamadı</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />

      {/* Karartma + Hedef Çerçevesi */}
      <View style={styles.overlay}>
        <View style={styles.topMask} />
        <View style={styles.middleRow}>
          <View style={styles.sideMask} />
          <View style={styles.scanFrame}>
            {/* Köşe işaretleri */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.sideMask} />
        </View>
        <View style={styles.bottomMask}>
          <Text style={styles.instruction}>{t('scanner.instruction')}</Text>
          {isSearching && (
            <ActivityIndicator color="#38bdf8" style={{ marginTop: 16 }} />
          )}
          {lastScanned && !isSearching && (
            <Text style={styles.lastScanned}>Son: {lastScanned}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const FRAME_SIZE = 260;
const CORNER = 24;
const BORDER = 3;
const CORNER_COLOR = '#38bdf8';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: { color: '#94a3b8', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  permissionBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permissionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  topMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  middleRow: { flexDirection: 'row', height: FRAME_SIZE },
  sideMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  bottomMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 24,
  },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  instruction: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  lastScanned: { color: '#38bdf8', fontSize: 12, marginTop: 8 },

  // Köşe işaretleri
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: CORNER_COLOR,
  },
  topLeft: {
    top: 0, left: 0,
    borderTopWidth: BORDER, borderLeftWidth: BORDER,
    borderTopLeftRadius: 4,
  },
  topRight: {
    top: 0, right: 0,
    borderTopWidth: BORDER, borderRightWidth: BORDER,
    borderTopRightRadius: 4,
  },
  bottomLeft: {
    bottom: 0, left: 0,
    borderBottomWidth: BORDER, borderLeftWidth: BORDER,
    borderBottomLeftRadius: 4,
  },
  bottomRight: {
    bottom: 0, right: 0,
    borderBottomWidth: BORDER, borderRightWidth: BORDER,
    borderBottomRightRadius: 4,
  },
});
