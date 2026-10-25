// Загрузка словарей на сервере: обходим packages/shared/src/i18n/<пространство>/{ru,ro}.ts
// и регистрируем всё найденное. Новое пространство подхватывается без правки этого файла.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  registerDictionaries,
  type DictionaryModule,
  isLang,
  type Lang,
} from '@sportpit/shared/i18n';

export const SHARED_I18N_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/shared/src/i18n',
);

export async function loadDictionaries(dir = SHARED_I18N_DIR): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const modules: Record<string, DictionaryModule> = {};
  const namespaces: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let found = false;
    for (const lang of ['ru', 'ro']) {
      const file = join(dir, entry.name, `${lang}.ts`);
      if (!existsSync(file)) continue;
      modules[`i18n/${entry.name}/${lang}.ts`] = (await import(
        /* @vite-ignore */ pathToFileURL(file).href
      )) as DictionaryModule;
      found = true;
    }
    if (found) namespaces.push(entry.name);
  }
  registerDictionaries(modules);
  return namespaces.sort();
}

/** Язык ответа по заголовку Accept-Language (или явному `?lang=`): румынский, иначе русский. */
export function pickLang(header: string | string[] | undefined, explicit?: unknown): Lang {
  if (isLang(explicit)) return explicit;
  const value = Array.isArray(header) ? header.join(',') : (header ?? '');
  for (const part of value.split(',')) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if (tag === 'ro') return 'ro';
    if (tag === 'ru') return 'ru';
  }
  return 'ru';
}
