// Тема оформления: по умолчанию следует за системой, переключатель фиксирует светлую или тёмную.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readStored, writeStored } from './storage.ts';
import { useT } from './i18n.tsx';

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'sportpit.theme';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];
const DARK_QUERY = '(prefers-color-scheme: dark)';
const THEME_COLORS = { light: '#1f6f4a', dark: '#0f1512' } as const;

function readMode(): ThemeMode {
  const value = readStored(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

interface ThemeValue {
  mode: ThemeMode;
  /** Что реально показано сейчас. */
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    // Цвет строки состояния на телефоне: при ручном выборе перекрываем обе подсказки из index.html,
    // при «как в системе» возвращаем исходные значения.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      if (meta.dataset.original === undefined) meta.dataset.original = meta.content;
      meta.content = mode === 'system' ? meta.dataset.original : THEME_COLORS[mode];
    }
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    writeStored(THEME_STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const cycle = useCallback(() => {
    setMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!);
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme нужно вызывать внутри ThemeProvider');
  return value;
}

/** Кнопка-переключатель: как в системе → светлая → тёмная. */
export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const t = useT();
  const current = t(`core.theme.${mode}`);
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`${t('core.theme.label')}: ${current}`}
    >
      {current}
    </button>
  );
}
