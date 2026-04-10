'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './use-auth';
import axios from 'axios';

interface ApiState<T> {
  data:    T | null;
  error:   string | null;
  loading: boolean;
}

// Singleton axios instance used by client components
const client = axios.create({ baseURL: '/api/v1' });

// Inject auth token on every request
client.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // Token is injected by the existing api-client singleton; here we do the same
    const token = (window as Window & { __enkap_token?: string }).__enkap_token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function useApi<T>(url: string | null, options?: { immediate?: boolean }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: false });
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    if (!url) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await client.get<T>(url, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        signal: abortRef.current.signal,
      });
      setState({ data, error: null, loading: false });
    } catch (err: unknown) {
      if (axios.isCancel(err)) return;
      const msg = axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'Bilinmeyen hata';
      setState({ data: null, error: msg, loading: false });
    }
  }, [url, accessToken]);

  useEffect(() => {
    if (options?.immediate !== false) fetch();
    return () => abortRef.current?.abort();
  }, [fetch, options?.immediate]);

  return { ...state, refetch: fetch };
}

export function useApiMutation<TBody, TResult = unknown>(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST') {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const mutate = useCallback(async (body?: TBody): Promise<TResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.request<TResult>({
        url, method, data: body,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      return data;
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'Hata oluştu';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [url, method, accessToken]);

  return { mutate, loading, error };
}
