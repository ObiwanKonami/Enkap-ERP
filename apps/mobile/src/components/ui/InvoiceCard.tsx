import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { formatCurrency, formatDate } from '../../i18n';
import type { LocalInvoice } from '../../database/models/LocalInvoice';

interface InvoiceCardProps {
  invoice: LocalInvoice;
  onPress: (invoice: LocalInvoice) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:        { label: 'Taslak',       color: '#94a3b8', bg: '#1e293b' },
  PENDING_GIB:  { label: 'GİB Bekliyor', color: '#f59e0b', bg: '#1c1200' },
  ACCEPTED_GIB: { label: 'GİB Onaylı',   color: '#22c55e', bg: '#0f1c0f' },
  REJECTED_GIB: { label: 'Reddedildi',   color: '#ef4444', bg: '#1c0f0f' },
  CANCELLED:    { label: 'İptal',         color: '#64748b', bg: '#111827' },
};

/**
 * FlashList için optimize edilmiş fatura liste kartı.
 * Bileşen saf (pure) — sadece props değişince yeniden render edilir.
 */
export const InvoiceCard: React.FC<InvoiceCardProps> = React.memo(({ invoice, onPress }) => {
  const statusConf = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG['DRAFT'];
  const isOverdue = invoice.isOverdue;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(invoice)}
    >
      {/* Üst satır: Fatura No + Durum Rozeti */}
      <View style={styles.row}>
        <Text style={styles.invoiceNumber} numberOfLines={1}>
          {invoice.invoiceNumber}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusConf.bg }]}>
          <Text style={[styles.badgeText, { color: statusConf.color }]}>
            {statusConf.label}
          </Text>
        </View>
      </View>

      {/* Orta: Alıcı adı */}
      <Text style={styles.buyerName} numberOfLines={1}>
        {invoice.buyerName}
      </Text>

      {/* Alt satır: Tarih + Toplam */}
      <View style={styles.row}>
        <View style={styles.dateBlock}>
          <Text style={styles.label}>Tarih</Text>
          <Text style={styles.dateText}>{formatDate(invoice.issueDate)}</Text>
        </View>

        {invoice.dueDate && (
          <View style={styles.dateBlock}>
            <Text style={styles.label}>Vade</Text>
            <Text style={[styles.dateText, isOverdue && styles.overdueText]}>
              {formatDate(invoice.dueDate)}
            </Text>
          </View>
        )}

        <View style={styles.totalBlock}>
          <Text style={styles.label}>{invoice.typeLabel}</Text>
          <Text style={styles.totalText}>
            {formatCurrency(invoice.total)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pressed: {
    opacity: 0.75,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e8f0',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  buyerName: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 10,
  },
  dateBlock: {
    flex: 1,
  },
  totalBlock: {
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dateText: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  overdueText: {
    color: '#ef4444',
  },
  totalText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38bdf8',
  },
});
