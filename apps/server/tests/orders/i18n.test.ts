import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ro from '../../../../packages/shared/src/i18n/orders/ro.ts';
import ru from '../../../../packages/shared/src/i18n/orders/ru.ts';
import { loadDictionaries } from '../../src/modules/system/index.ts';
import { t } from '@sportpit/shared/i18n';

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = join(here, '..', '..', 'src', 'modules', 'orders');
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
  'orders.ts',
);
const pausePath = join(here, '..', '..', 'src', 'modules', 'billing', 'pause.ts');

/** Ключи вида orders.error.xxx, которые сервер и схемы отдают клиенту. */
function usedKeys(): string[] {
  const files = [
    ...readdirSync(moduleDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(moduleDir, f)),
    sharedSchema,
    pausePath,
  ];
  const keys = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/'orders\.([A-Za-z0-9_.]+)'/g)) {
      keys.add(match[1]!);
    }
  }
  return [...keys];
}

describe('тексты ошибок заказов', () => {
  it('каждый ключ orders.*, который отдаёт сервер или схема, есть в обоих словарях', () => {
    const keys = usedKeys();
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(Object.keys(ru), `ru: ${key}`).toContain(key);
      expect(Object.keys(ro), `ro: ${key}`).toContain(key);
    }
  });

  it('ru и ro: одинаковые ключи', () => {
    expect(Object.keys(ro).sort()).toEqual(Object.keys(ru).sort());
  });

  it('сервер подгружает пространство orders и подставляет параметры', async () => {
    await loadDictionaries();
    expect(t('ru', 'orders.error.cutoffPassed', { time: '18:00' })).toContain('18:00');
    expect(t('ro', 'orders.error.cutoffPassed', { time: '18:00' })).toContain('18:00');
    expect(t('ru', 'orders.error.noSeats', { left: 0 })).toContain('Мест нет');
  });
});
