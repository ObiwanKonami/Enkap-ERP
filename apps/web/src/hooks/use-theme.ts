'use client';

import { useEffect, useState, useCallback } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'enkap-theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  // İlk render: localStorage'dan veya sistem tercihinden oku
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') {
      applyTheme(stored);
      setTheme(stored);
    } else {
      // Sistem tercihi
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial: Theme = prefersDark ? 'dark' : 'light';
      applyTheme(initial);
      setTheme(initial);
    }
  }, []);

  const applyTheme = (t: Theme) => {
    if (t === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle, isDark: theme === 'dark' };
}
