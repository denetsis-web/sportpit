import { describe, expect, it } from 'vitest';
import { clientModules } from '../src/app/modules.ts';
import { collectFeatures, type FeatureRoutesModule } from '../src/app/routes.tsx';

describe('сборка маршрутов функций', () => {
  it('настоящие функции проекта собираются без конфликтов путей', () => {
    expect(() => collectFeatures(clientModules)).not.toThrow();
  });

  it('пункты меню сортируются по order, маршруты не зависят от порядка файлов', () => {
    const a: FeatureRoutesModule = {
      routes: [{ path: 'a' }],
      nav: [{ to: '/a', labelKey: 'a.nav', order: 30 }],
    };
    const b: FeatureRoutesModule = {
      routes: [{ path: 'b' }],
      nav: [
        { to: '/b', labelKey: 'b.nav', order: 10 },
        { to: '/b2', labelKey: 'b.nav2' },
      ],
    };
    const first = collectFeatures({
      '../features/client/b/routes.tsx': b,
      '../features/client/a/routes.tsx': a,
    });
    const second = collectFeatures({
      '../features/client/a/routes.tsx': a,
      '../features/client/b/routes.tsx': b,
    });
    expect(first.nav.map((n) => n.to)).toEqual(['/b', '/a', '/b2']);
    expect(first.routes.map((r) => r.path)).toEqual(['a', 'b']);
    expect(second.routes.map((r) => r.path)).toEqual(['a', 'b']);
  });

  it('один и тот же путь в двух функциях — понятная ошибка с именами файлов', () => {
    const mk = (): FeatureRoutesModule => ({ routes: [{ path: 'orders' }] });
    expect(() =>
      collectFeatures({ 'x/orders/routes.tsx': mk(), 'x/history/routes.tsx': mk() }),
    ).toThrow(/orders.*history|history.*orders/);
  });

  it('модуль без routes и nav допустим', () => {
    expect(collectFeatures({ 'x/routes.tsx': {} })).toEqual({ routes: [], nav: [] });
  });
});
