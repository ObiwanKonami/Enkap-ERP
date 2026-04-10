/**
 * Şirket adını URL-safe, küçük harfli slug'a çevirir.
 *
 * Örnek: "Ahmet & Mehmet İnşaat A.Ş." → "ahmet-mehmet-insaat-as"
 *
 * Kurallar:
 * - Türkçe karakterler → ASCII karşılığı
 * - Alfanümerik olmayan karakterler → tire
 * - Ardışık/baştaki/sondaki tireler temizlenir
 * - Max 50 karakter
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
