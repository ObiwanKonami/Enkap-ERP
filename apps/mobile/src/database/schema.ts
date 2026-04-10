import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * WatermelonDB offline şeması.
 *
 * Sadece mobil uygulamanın çevrimdışı kullanacağı tablolar buradadır.
 * Şema değişikliğinde sürüm numarasını artır ve migration yaz.
 *
 * SQLCipher şifrelemesi: DatabaseProvider'da şifre ayarlanır (expo-secure-store'dan alınır).
 *
 * Sync protokolü: WatermelonDB Sync — pull/push endpoint'leri.
 * Her kayıtta: _status (synced/created/updated/deleted), _changed
 */
export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'invoices',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },      // UUID (backend)
        { name: 'invoice_number', type: 'string' },
        { name: 'invoice_type', type: 'string' },                     // E_FATURA | E_ARSIV
        { name: 'direction', type: 'string' },                        // OUT | IN
        { name: 'status', type: 'string' },                           // DRAFT | PENDING_GIB | ...
        { name: 'buyer_name', type: 'string' },
        { name: 'buyer_tax_id', type: 'string', isOptional: true },
        { name: 'subtotal', type: 'number' },
        { name: 'kdv_total', type: 'number' },
        { name: 'discount_total', type: 'number' },
        { name: 'total', type: 'number' },
        { name: 'currency', type: 'string' },
        { name: 'issue_date', type: 'number' },                       // Unix timestamp
        { name: 'due_date', type: 'number', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'invoice_lines',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'invoice_id', type: 'string' },                       // WatermelonDB local ID
        { name: 'description', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'unit_price', type: 'number' },
        { name: 'discount_pct', type: 'number' },
        { name: 'kdv_rate', type: 'number' },
        { name: 'kdv_amount', type: 'number' },
        { name: 'line_total', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'products',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'sku', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'barcode', type: 'string', isOptional: true },
        { name: 'unit_code', type: 'string' },
        { name: 'kdv_rate', type: 'number' },
        { name: 'list_price_kurus', type: 'number' },
        { name: 'total_stock_qty', type: 'number' },
        { name: 'reorder_point', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'category_name', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'sync_meta',
      columns: [
        { name: 'key', type: 'string' },                              // 'last_pulled_at' vb.
        { name: 'value', type: 'string' },
      ],
    }),
  ],
});
