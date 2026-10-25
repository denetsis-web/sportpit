import { render } from '@testing-library/react';
import {
  registerDictionaries,
  resetDictionaries,
  type DictionaryModule,
} from '@sportpit/shared/i18n';
import { App, type AppProps } from '../src/app/App.tsx';

// ---- matchMedia: в jsdom его нет, а тема и установка PWA опираются на него ----

type Listener = (event: { matches: boolean; media: string }) => void;
const mediaState = new Map<string, boolean>();
const mediaListeners = new Map<string, Set<Listener>>();

function installMatchMedia(): void {
  window.matchMedia = (query: string) => {
    const listeners = mediaListeners.get(query) ?? new Set<Listener>();
    mediaListeners.set(query, listeners);
    return {
      get matches() {
        return mediaState.get(query) ?? false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
}

/** Меняет ответ matchMedia и уведомляет подписчиков, как это делает браузер. */
export function setMedia(query: string, matches: boolean): void {
  mediaState.set(query, matches);
  mediaListeners.get(query)?.forEach((listener) => listener({ matches, media: query }));
}

export function resetMediaMocks(): void {
  mediaState.clear();
  mediaListeners.clear();
  installMatchMedia();
}
installMatchMedia();

export const DARK = '(prefers-color-scheme: dark)';

// ---- словари ----

const coreModules = import.meta.glob<DictionaryModule>(
  '../../../packages/shared/src/i18n/*/{ru,ro}.ts',
  { eager: true },
);

/** Регистрирует настоящие словари проекта (и, если нужно, дополнительные тестовые). */
export function registerRealDictionaries(extra: Record<string, DictionaryModule> = {}): void {
  resetDictionaries();
  registerDictionaries({ ...coreModules, ...extra });
}

// ---- отрисовка приложения ----

export function setStoredLang(lang: 'ru' | 'ro'): void {
  window.localStorage.setItem('sportpit.lang', lang);
}

export function renderApp(
  props: AppProps = {},
  options: { lang?: 'ru' | 'ro' | null; dictionaries?: Record<string, DictionaryModule> } = {},
) {
  registerRealDictionaries(options.dictionaries);
  const lang = options.lang === undefined ? 'ru' : options.lang;
  if (lang) setStoredLang(lang);
  return render(<App initialEntries={['/']} clientModules={{}} adminModules={{}} {...props} />);
}
