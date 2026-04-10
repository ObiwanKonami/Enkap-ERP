import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { apiClient } from '../../services/auth/api-client';
import { getDatabase, LocalInvoice } from '../../database';
import { formatCurrency, formatDate } from '../../i18n';
import * as Haptics from 'expo-haptics';

interface DetailProps {
  invoice: LocalInvoice | null;
}

const InvoiceDetailContent: React.FC<DetailProps> = ({ invoice }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  if (!invoice) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  const canApprove = invoice.status === 'DRAFT';
  const canCancel = invoice.status === 'DRAFT' || invoice.status === 'REJECTED_GIB';

  const handleApprove = useCallback(async () => {
    Alert.alert(
      'Faturayı Onayla',
      `${invoice.invoiceNumber} faturası GİB'e gönderilecek. Onaylıyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            try {
              await apiClient.patch(`/api/v1/invoices/${invoice.serverId}/approve`);
              router.back();
            } catch {
              Alert.alert('Hata', 'Fatura onaylanırken hata oluştu');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [invoice]);

  const handleCancel = useCallback(async () => {
    Alert.alert(
      'Faturayı İptal Et',
      'Bu işlem geri alınamaz. İptal etmek istiyor musunuz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await apiClient.patch(`/api/v1/invoices/${invoice.serverId}/cancel`);
              router.back();
            } catch {
              Alert.alert('Hata', 'Fatura iptal edilirken hata oluştu');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [invoice]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Başlık */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
          <View style={styles.typeTag}>
            <Text style={styles.typeTagText}>{invoice.typeLabel}</Text>
          </View>
        </View>
        <Text style={styles.statusText}>{invoice.statusLabel}</Text>
      </View>

      {/* Alıcı Bilgileri */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alıcı</Text>
        <Text style={styles.buyerName}>{invoice.buyerName}</Text>
        {invoice.buyerTaxId && (
          <Text style={styles.detail}>VKN/TCKN: {invoice.buyerTaxId}</Text>
        )}
      </View>

      {/* Tarihler */}
      <View style={styles.section}>
        <Row label="Fatura Tarihi" value={formatDate(invoice.issueDate)} />
        {invoice.dueDate && (
          <Row
            label="Vade Tarihi"
            value={formatDate(invoice.dueDate)}
            highlight={invoice.isOverdue}
          />
        )}
      </View>

      {/* Tutarlar */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('invoice.detail.lines')}</Text>
        <View style={styles.separator} />
        <Row label={t('invoice.detail.subtotal')} value={formatCurrency(invoice.subtotal)} />
        {invoice.discountTotal > 0 && (
          <Row label={t('invoice.detail.discount')} value={`-${formatCurrency(invoice.discountTotal)}`} />
        )}
        <Row label={t('invoice.detail.kdv')} value={formatCurrency(invoice.kdvTotal)} />
        <View style={styles.separator} />
        <Row
          label={t('invoice.detail.total')}
          value={formatCurrency(invoice.total)}
          bold
        />
      </View>

      {/* Notlar */}
      {invoice.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('invoice.detail.notes')}</Text>
          <Text style={styles.notes}>{invoice.notes}</Text>
        </View>
      )}

      {/* Aksiyonlar */}
      {(canApprove || canCancel) && (
        <View style={styles.actions}>
          {canApprove && (
            <Pressable
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={handleApprove}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.actionBtnText}>{t('invoice.detail.approve')}</Text>
              }
            </Pressable>
          )}
          {canCancel && (
            <Pressable
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>
                {t('invoice.detail.cancel')}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const Row: React.FC<{
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}> = ({ label, value, bold, highlight }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[
      styles.rowValue,
      bold && styles.rowValueBold,
      highlight && styles.rowValueHighlight,
    ]}>
      {value}
    </Text>
  </View>
);

// WatermelonDB reaktif bağlama
const enhance = withObservables(
  ['invoiceId'],
  ({ invoiceId }: { invoiceId: string }) => ({
    invoice: getDatabase()
      .get<LocalInvoice>('invoices')
      .query(Q.where('id', invoiceId))
      .observe()
      .pipe(
        // İlk elemanı al
        require('rxjs/operators').map((items: LocalInvoice[]) => items[0] ?? null),
      ),
  }),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EnhancedDetail = enhance(InvoiceDetailContent as any);

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EnhancedDetail invoiceId={id} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  headerCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  invoiceNumber: { fontSize: 18, fontWeight: '800', color: '#f1f5f9', flex: 1 },
  typeTag: { backgroundColor: '#172554', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  typeTagText: { fontSize: 11, color: '#93c5fd', fontWeight: '600' },
  statusText: { fontSize: 13, color: '#94a3b8' },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: { fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  buyerName: { fontSize: 16, fontWeight: '600', color: '#e2e8f0', marginBottom: 4 },
  detail: { fontSize: 13, color: '#64748b' },
  separator: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: '#94a3b8', flex: 1 },
  rowValue: { fontSize: 13, color: '#e2e8f0', fontWeight: '500', textAlign: 'right' },
  rowValueBold: { fontSize: 16, fontWeight: '700', color: '#38bdf8' },
  rowValueHighlight: { color: '#ef4444' },
  notes: { fontSize: 13, color: '#94a3b8', lineHeight: 20 },
  actions: { gap: 10, marginTop: 8 },
  actionBtn: { borderRadius: 12, padding: 16, alignItems: 'center' },
  approveBtn: { backgroundColor: '#1d4ed8' },
  cancelBtn: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#ef4444' },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
