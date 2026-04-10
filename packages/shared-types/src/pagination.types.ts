/**
 * Standart sayfalanmış liste yanıt tipi.
 * Tüm listeleme endpoint'lerinde bu format kullanılır.
 *
 * @example
 * {
 *   items: [...],
 *   total: 150,
 *   page: 2,
 *   limit: 50,
 * }
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
