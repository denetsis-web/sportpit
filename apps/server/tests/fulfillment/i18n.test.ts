import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ro from '../../../../packages/shared/src/i18n/fulfillment/ro.ts';
import ru from '../../../../packages/shared/src/i18n/fulfillment/ru.ts';
import { loadDictionaries } from '../../src/modules/system/index.ts';
import { t } from '@sportpit/shared/i18n';

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = join(here, '..', '..', 'src', 'modules', 'fulfillment');
const sharedSchema = join(
  here,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'shared',
  'src',
  'schemas',
  'fulfillment.ts',
);

/** Ключи вида fulfillment.error.xxx, которые сервер и схемы отдают клиенту. */
function usedKeys(): string[] {
  const files = [
    ...readdirSync(moduleDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(moduleDir, f)),
    sharedSchema,
  ];
  const keys = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/'fulfillment\.([A-Za-z0-9_.]+)'/g)) {
      keys.add(match[1]!);
    }
  }
  return [...keys];
}

describe('тексты выдачи', () => {
  it('каждый ключ fulfillment.*, который отдаёт сервер или схема, есть в обоих словарях', () => {
    const keys = usedKeys();
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(Object.keys(ru), `ru: ${key}`).toContain(key);
      expect(Object.keys(ro), `ro: ${key}`).toContain(key);
    }
  });

  it('сервер подгружает пространство fulfillment и подставляет параметры на обоих языках', async () => {
    await loadDictionaries();
    expect(t('ru', 'fulfillment.error.batchesNotCooked', { dishes: 'Суп' })).toContain('Суп');
    expect(t('ro', 'fulfillment.error.batchesNotCooked', { dishes: 'Supă' })).toContain('Supă');
    expect(t('ru', 'fulfillment.error.window', { from: '07:00', to: '22:00' })).toContain('22:00');
    expect(t('ro', 'fulfillment.error.invalidCode')).not.toBe('fulfillment.error.invalidCode');
  });
});
