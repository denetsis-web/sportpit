// Язык интерфейса: русский или румынский. Выбор хранится в localStorage и сразу меняет весь интерфейс.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { formatDate, formatDateTime, formatMoney, formatTime } from '@sportpit/shared/format';
import {
  DEFAULT_LANG,
  isLang,
  LANG_STORAGE_KEY,
  t as translate,
  type Lang,
  type TranslateParams,
} from '@sportpit/shared/i18n';
import { readStored, writeStored } from './storage.ts';

/** Язык, который клиент уже выбирал (или `null` при первом запуске). */
export function readStoredLang(): Lang | null {
  const value = readStored(LANG_STORAGE_KEY);
  return isLang(value) ? value : null;
}

/** Язык для первого запуска: язык браузера, если он румынский, иначе русский. */
export function detectBrowserLang(): Lang {
  const languages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const tag of languages) {
    const code = tag.slice(0, 2).toLowerCase();
    if (code === 'ro' || code === 'ru') return code;
  }
  return DEFAULT_LANG;
}

type LangListener = (lang: Lang) => void;
const listeners = new Set<LangListener>();

/** Подписка на смену языка (например, чтобы сохранить его в профиле). Возвращает отписку. */
export function onLangChange(listener: LangListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type TFunction = (key: string, params?: TranslateParams) => string;

interface I18nValue {
  lang: Lang;
  /** Язык ещё не выбирали явно: пора показать выбор при первом запуске. */
  needsChoice: boolean;
  setLang: (lang: Lang) => void;
  t: TFunction;
  money: (bani: number) => string;
  date: (iso: string) => string;
  time: (iso: string) => string;
  dateTime: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [stored, setStored] = useState<Lang | null>(() => initialLang ?? readStoredLang());
  const [lang, setLangState] = useState<Lang>(() => stored ?? detectBrowserLang());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    writeStored(LANG_STORAGE_KEY, next);
    setStored(next);
    setLangState(next);
    listeners.forEach((listener) => listener(next));
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      needsChoice: stored === null,
      setLang,
      t: (key, params) => translate(lang, key, params),
      money: (bani) => formatMoney(bani, lang),
      date: (iso) => formatDate(iso, lang),
      time: (iso) => formatTime(iso),
      dateTime: (iso) => formatDateTime(iso, lang),
    }),
    [lang, stored, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n нужно вызывать внутри I18nProvider');
  return value;
}

/** Короткий путь к переводу: `const t = useT(); t('core.slogan')`. */
export function useT(): TFunction {
  return useI18n().t;
}
