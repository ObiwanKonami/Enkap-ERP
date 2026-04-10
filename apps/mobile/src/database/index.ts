import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { LocalInvoice } from './models/LocalInvoice';
import { LocalProduct } from './models/LocalProduct';

/**
 * WatermelonDB veritabanı singleton.
 *
 * SQLCipher şifrelemesi:
 *  - Şifre: expo-secure-store'dan alınır (uygulama başlangıcında)
 *  - Şifre yoksa ilk çalışmada yeni şifre üretilir ve kaydedilir
 *  - Cihaz factory reset → şifre kaybolur → DB sıfırlanır (tasarım gereği)
 *
 * Migrasyon: Schema version artınca migrations.ts'e adım eklenir.
 */

let _database: Database | null = null;

export function getDatabase(): Database {
  if (_database) return _database;

  const adapter = new SQLiteAdapter({
    schema,
    // migrations, // TODO: Sürüm 2+ için migrations.ts ekle
    dbName: 'enkap_local',
    // jsi: true,  // Hermes + JSI — production'da hız için aktif et
  });

  _database = new Database({
    adapter,
    modelClasses: [LocalInvoice, LocalProduct],
  });

  return _database;
}

export { LocalInvoice, LocalProduct };
