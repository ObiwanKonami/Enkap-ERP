import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { router } from 'expo-router';
import { InvoiceCard } from '../../components/ui/InvoiceCard';
import { getDatabase, LocalInvoice } from '../../database';

type StatusFilter = 'ALL' | 'DRAFT' | 'ACCEPTED_GIB' | 'REJECTED_GIB';

const FILTER_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL',          label: 'Tümü' },
  { key: 'DRAFT',        label: 'Taslak' },
  { key: 'ACCEPTED_GIB', label: 'Onaylı' },
  { key: 'REJECTED_GIB', label: 'Reddedilen' },
];

interface InvoiceListProps {
  invoices: LocalInvoice[];
}

/**
 * WatermelonDB reaktif bileşen.
 * `withObservables` → DB değişince otomatik yeniden render.
 * FlashList → büyük listelerde FlatList'ten ~5x daha hızlı.
 */
const InvoiceListContent: React.FC<InvoiceListProps> = ({ invoices }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchStatus = filter === 'ALL' || inv.status === filter;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.buyerName.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [invoices, filter, search]);

  const handlePress = useCallback((invoice: LocalInvoice) => {
    router.push(`/invoices/${invoice.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: LocalInvoice }) => (
      <InvoiceCard invoice={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: LocalInvoice) => item.id, []);

  return (
    <View style={styles.container}>
      {/* Arama */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('common.search')}
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCapitalize="none"
        />
      </View>

      {/* Durum Filtreleri */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text
              style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Fatura Sayısı */}
      <Text style={styles.count}>
        {filtered.length} fatura
      </Text>

      {/* Liste */}
      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={120}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('common.noData')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

// WatermelonDB reaktif bağlama — filtre durumunu DB sorgusu ile bağla
const enhance = withObservables([], () => ({
  invoices: getDatabase()
    .get<LocalInvoice>('invoices')
    .query(Q.sortBy('issue_date', Q.desc))
    .observe(),
}));

export default enhance(InvoiceListContent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f1f5f9',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterTabActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#3b82f6',
  },
  filterTabText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#bfdbfe',
  },
  count: {
    fontSize: 12,
    color: '#475569',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 32,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#475569',
    fontSize: 15,
  },
});
