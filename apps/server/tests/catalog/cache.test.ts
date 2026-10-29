import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Service worker кэширует GET по шаблону из настроек PWA клиента. Под такими путями должно быть только публичное:
// админский CRUD блюд и меню живёт под /api/v1/admin/... и в кэш попасть не должен.
const viteConfig = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'vite.config.ts'),
  'utf8',
);
const source = /urlPattern:\s*\/(.+)\/,/.exec(viteConfig)?.[1];

describe('кэш меню в service worker и пути админки (Решения по реализации)', () => {
  it('шаблон кэша найден в настройках клиента', () => {
    expect(source).toBeTruthy();
  });

  it('публичные меню и карточки блюд кэшируются, админские пути — нет', () => {
    const pattern = new RegExp(source!.replaceAll('\\/', '/'));
    for (const url of [
      '/api/v1/menu',
      '/api/v1/menu?date=2026-03-11',
      '/api/v1/dishes/7?date=2026-03-11',
    ]) {
      expect(pattern.test(url), url).toBe(true);
    }
    for (const url of [
      '/api/v1/admin/dishes',
      '/api/v1/admin/dishes/7',
      '/api/v1/admin/dishes/7/photo',
      '/api/v1/admin/menu',
      '/api/v1/admin/menu/2026-03-11',
      '/api/v1/admin/menu/2026-03-11/publish',
      '/api/v1/admin/settings',
      '/api/v1/fridges',
    ]) {
      expect(pattern.test(url), url).toBe(false);
    }
  });
});
