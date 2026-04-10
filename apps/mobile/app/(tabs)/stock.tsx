import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { router } from 'expo-router';
import { getDatabase, LocalProduct } from '../../src/database';
import { formatCurrency } from '../../src/i18n';

interface StockListProps {
  products: LocalProduct[];
}

const StockListContent: React.FC<StockListProps> = ({ products }) => {
  const [search, setSearch] = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q);
    const matchLow = !showLowOnly || p.isLowStock || p.isOutOfStock;
    return matchSearch && matchLow;
  });

  const renderItem = useCallback(
    ({ item }: { item: LocalProduct }) => (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
        onPress={() => router.push({ pathname: '/stock/[id]', params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <View style={[
            styles.stockBadge,
            item.isOutOfStock && styles.badgeRed,
            item.isLowStock && !item.isOutOfStock && styles.badgeYellow,
          ]}>
            <Text style={styles.stockBadgeText}>{item.stockStatusLabel}</Text>
          </View>
        </View>
        <Text style={styles.sku}>SKU: {item.sku}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.qty}>{item.totalStockQty.toLocaleString('tr-TR')} {item.unitCode}</Text>
          <Text style={styles.price}>{formatCurrency(item.listPriceTl)}</Text>
        </View>
      </Pressable>
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Ürün, SKU veya barkod ara..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCapitalize="none"
        />
      </View>

      <Pressable
        style={[styles.filterBtn, showLowOnly && styles.filterBtnActive]}
        onPress={() => setShowLowOnly((v) => !v)}
      >
        <Text style={[styles.filterBtnText, showLowOnly && styles.filterBtnTextActive]}>
          ⚠️ Sadece düşük stok
        </Text>
      </Pressable>

      <Text style={styles.count}>{filtered.length} ürün</Text>

      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={90}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Ürün bulunamadı</Text>
          </View>
        }
      />
    </View>
  );
};

const enhance = withObservables([], () => ({
  products: getDatabase()
    .get<LocalProduct>('products')
    .query(Q.where('is_active', true), Q.sortBy('name', Q.asc))
    .observe(),
}));

export default enhance(StockListContent);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
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
  filterBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignSelf: 'flex-start',
  },
  filterBtnActive: { backgroundColor: '#451a03', borderColor: '#f59e0b' },
  filterBtnText: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  filterBtnTextActive: { color: '#fcd34d' },
  count: { fontSize: 12, color: '#475569', paddingHorizontal: 16, marginBottom: 8 },
  listContent: { paddingBottom: 32 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  productName: { fontSize: 14, fontWeight: '700', color: '#e2e8f0', flex: 1, marginRight: 8 },
  stockBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#1e293b' },
  badgeRed: { backgroundColor: '#1c0f0f' },
  badgeYellow: { backgroundColor: '#1c1200' },
  stockBadgeText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  sku: { fontSize: 11, color: '#64748b', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qty: { fontSize: 14, color: '#94a3b8', fontWeight: '600' },
  price: { fontSize: 14, color: '#38bdf8', fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#475569', fontSize: 15 },
});
