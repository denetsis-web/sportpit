// Словари интерфейса. Строки лежат по пространствам имён:
//   packages/shared/src/i18n/<namespace>/ru.ts и ro.ts  (default export: { ключ: 'текст' })
// Полный ключ — «пространство.ключ», например `core.slogan`.
// Пространства подхватываются автоматически: клиент собирает их через import.meta.glob,
// сервер — чтением папки (см. apps/server/src/modules/system/i18n.ts). Центрального списка нет.

export type Lang = 'ru' | 'ro';
export const LANGS: readonly Lang[] = ['ru', 'ro'];
export const DEFAULT_LANG: Lang = 'ru';
/** Ключ localStorage, где клиент хранит выбранный язык. */
export const LANG_STORAGE_KEY = 'sportpit.lang';

export type Dictionary = Record<string, string>;
/** Тип для ro.ts: ключи обязаны совпасть с ru.ts уже на этапе компиляции. */
export type DictionaryOf<T extends Dictionary> = Record<keyof T, string>;
export type TranslateParams = Record<string, string | number>;

export interface DictionaryModule {
  default: Dictionary;
}

const store: Record<Lang, Map<string, string>> = { ru: new Map(), ro: new Map() };
const namespaces = new Set<string>();

export function isLang(value: unknown): value is Lang {
  return value === 'ru' || value === 'ro';
}

export function registerNamespace(namespace: string, lang: Lang, dictionary: Dictionary): void {
  namespaces.add(namespace);
  for (const [key, value] of Object.entries(dictionary)) {
    store[lang].set(`${namespace}.${key}`, value);
  }
}

/**
 * Принимает результат import.meta.glob по файлам i18n/<пространство>/ru.ts и ro.ts
 * (или такой же объект «путь → модуль»): пространство и язык берутся из пути.
 */
export function registerDictionaries(modules: Record<string, DictionaryModule>): void {
  for (const [path, mod] of Object.entries(modules)) {
    const match = /i18n[\\/]([^\\/]+)[\\/](ru|ro)\.[cm]?[jt]s$/.exec(path);
    if (!match) continue;
    registerNamespace(match[1]!, match[2] as Lang, mod.default);
  }
}

export function resetDictionaries(): void {
  store.ru.clear();
  store.ro.clear();
  namespaces.clear();
}

export function getNamespaces(): string[] {
  return [...namespaces].sort();
}

export function hasKey(key: string): boolean {
  return store.ru.has(key) || store.ro.has(key);
}

/** Перевод: нет в языке — берём русский, нет и его — возвращаем сам ключ. */
export function t(lang: Lang, key: string, params?: TranslateParams): string {
  const raw = store[lang].get(key) ?? store.ru.get(key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
