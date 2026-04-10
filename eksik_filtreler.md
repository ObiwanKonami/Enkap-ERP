# Eksik Backend Filtreleri

Bu dosya, UI'da gösterilen ancak backend endpoint'inde karşılığı olmayan filtre alanlarını takip eder.
Filtre backend'e eklendikten sonra satır `[x]` ile işaretlenir — silinmez.

**Format:**

- `[ ]` = Eksik, henüz eklenmedi
- `[x]` = Tamamlandı

---

<!-- Yeni eksik filtreler buraya eklenir -->

## Proje (/proje)

- [ ] `search` — Proje adı veya proje koduna göre arama (2026-03-30)
  - Not: Aktif olduktan sonra proje-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Duran Varlık (/duran-varlik)

- [ ] `search` — Varlık adı veya koduna göre arama (2026-03-30)
  - Not: Aktif olduktan sonra duran-varlik-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Stok (/stok)

- [ ] `lowStock` — Kritik/normal stok durumu filtresi (boolean) (2026-03-29)

## Satın Alma (/satin-alma)

- [ ] `search` — PO no veya tedarikçi adına göre arama (2026-03-29)
  - Not: Aktif olduktan sonra satin-alma-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Siparişler (/siparis)

- [ ] `search` — Sipariş no veya müşteri adına göre arama (2026-03-29)
  - Not: Aktif olduktan sonra siparis-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## İrsaliyeler (/irsaliyeler)

- [ ] `search` — İrsaliye no, gönderici veya alıcı adına göre arama (2026-03-30)
  - Not: Aktif olduktan sonra irsaliyeler-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Lojistik (/lojistik)

- [ ] `search` — Referans no, takip no veya alıcı adına göre arama (2026-03-30)
  - Not: Aktif olduktan sonra lojistik-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Üretim (/uretim)

- [ ] `search` — İş emri no veya ürün adına göre arama (2026-03-30)
  - Not: Aktif olduktan sonra uretim-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Müşteri (/musteri)

- [x] `q` — Müşteri adı, e-posta veya şehir adına göre arama (2026-03-30)
  - Not: Backend zaten destekliyor (crmApi.contacts.list params'ta q var)

## İzin (/izin)

- [ ] `q` — Çalışan adı veya izin türüne göre arama (2026-03-30)
  - Not: Aktif olduktan sonra izin-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Masraf (/masraf)

- [ ] `q` — Çalışan adı veya döneme göre arama (2026-03-30)
  - Not: Şu an client-side filtering yapılıyor, backend'e eklendikten sonra kaldırılacak

## Aktiviteler (/aktiviteler)

- [ ] `q` — Aktivite konusu veya müşteri adına göre arama (2026-03-30)

## Faturalar (/faturalar)

- [ ] `invoiceType` — Fatura tipi filtresi (E_FATURA, E_ARSIV, PURCHASE, PROFORMA) (2026-03-29)
- [ ] `dateFrom` / `dateTo` — Fatura tarihi aralığı filtresi (2026-03-29)
- [ ] `counterpartyId` — Müşteri/Tedarikçi ID filtresi (2026-03-29)

## Kasa & Banka (/kasa-banka)

- [ ] `accountType` — Hesap tipi filtresi (KASA/BANKA) (2026-03-30)
  - Not: Aktif olduktan sonra kasa-banka-client-page.tsx'deki `@ts-expect-error` yorumu kaldırılacak

## Bordro (/bordro)

- [ ] `limit` / `offset` — Pagination desteği (2026-03-30)
  - Not: Backend şu an tüm çalışanları tek seferde döndürüyor, çok çalışanlı tenant'larda performans sorunu olabilir
  <!-- Örnek:

## Faturalar (/faturalar)

- [ ] `dateFrom` / `dateTo` — Tarih aralığı filtresi (2026-03-29)
- [ ] `minAmount` / `maxAmount` — Tutar aralığı filtresi (2026-03-29)
      -->
