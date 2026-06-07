import { useState, useEffect } from 'react';

const STORAGE_KEY = 'theme';
type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
}

export function useDarkMode(): [boolean, () => void] {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return saved === 'dark';
  });
  useEffect(() => {
    const theme: Theme = isDark ? 'dark' : 'light';
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [isDark]);

  const toggle = () => setIsDark(prev => !prev);

  return [isDark, toggle];
}
