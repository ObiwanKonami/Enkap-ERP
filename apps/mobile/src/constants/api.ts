/** API endpoint sabitleri */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
export const AUTH_SERVICE_URL = `${API_BASE_URL}/auth`;
export const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 dakika kala yenile
