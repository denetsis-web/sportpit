import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import adminRo from '../../../../packages/shared/src/i18n/admin/ro.ts';
import adminRu from '../../../../packages/shared/src/i18n/admin/ru.ts';
import catalogRo from '../../../../packages/shared/src/i18n/catalog/ro.ts';
import catalogRu from '../../../../packages/shared/src/i18n/catalog/ru.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

// Только код таска 03: сервер, схемы и экраны клиента и админки.
const sources = [
  join(root, 'apps/server/src/modules/admin'),
  join(root, 'apps/server/src/modules/catalog'),
  join(root, 'packages/shared/src/schemas/admin.ts'),
  join(root, 'packages/shared/src/schemas/catalog.ts'),
  join(root, 'apps/web/src/features/client/menu'),
  ...['gyms', 'fridges', 'dishes', 'menu', 'settings'].map((n) =>
    join(root, 'apps/web/src/features/admin', n),
  ),
].flatMap((p) => (statSync(p).isDirectory() ? files(p) : [p]));

const known = new Set([
  ...Object.keys(adminRu).map((k) => `admin.${k}`),
  ...Object.keys(catalogRu).map((k) => `catalog.${k}`),
]);

describe('словари catalog и admin (R52)', () => {
  it('каждый ключ admin.* и catalog.*, написанный в коде таска, есть в словаре', () => {
    const missing: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/['"]((?:admin|catalog)\.[A-Za-z0-9_.]+)['"]/g)) {
        const key = match[1]!;
        if (!known.has(key)) missing.push(`${key} (${file.replace(root, '')})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('ключи, собранные из шаблонов, существуют для каждого значения перечисления', async () => {
    const { ALLERGENS, GOALS, REVIEW_TAGS } = await import('@sportpit/shared/schemas/catalog');
    const keys = [
      ...ALLERGENS.map((a) => `catalog.allergen.${a}`),
      ...GOALS.map((g) => `catalog.filter.goal.${g}`),
      ...REVIEW_TAGS.map((tag) => `catalog.tag.${tag}`),
    ];
    expect(keys.filter((k) => !known.has(k))).toEqual([]);
  });

  it('ru и ro совпадают по ключам', () => {
    expect(Object.keys(adminRo).sort()).toEqual(Object.keys(adminRu).sort());
    expect(Object.keys(catalogRo).sort()).toEqual(Object.keys(catalogRu).sort());
  });

  it('все сообщения проверки в схемах (ключи error.*) есть в словарях обоих языков', () => {
    const ro = new Set([
      ...Object.keys(adminRo).map((k) => `admin.${k}`),
      ...Object.keys(catalogRo).map((k) => `catalog.${k}`),
    ]);
    const used = new Set<string>();
    for (const file of sources) {
      for (const m of readFileSync(file, 'utf8').matchAll(
        /['"]((?:admin|catalog)\.error\.[A-Za-z]+)['"]/g,
      )) {
        used.add(m[1]!);
      }
    }
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((k) => !ro.has(k))).toEqual([]);
  });
});
