import { describe, expect, it } from 'vitest';
import { runSeed } from '../../src/modules/reports/seed.ts';
import { call } from '../admin/helpers.ts';
import { makeApp, productionConfig } from '../auth/helpers.ts';

const count = (test: Awaited<ReturnType<typeof makeApp>>, table: string): number =>
  test.app.deps.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;

describe('стартовые данные: npm run seed (R61i)', () => {
  it('создаёт демо-зал, два разных холодильника, 10 блюд «ДЕМО» и опубликованное меню на 3 дня', async () => {
    const test = await makeApp(); // сегодня 10 марта 2026 по Кишинёву
    const lines: string[] = [];
    const result = runSeed(test.app.deps, (line) => lines.push(line));

    expect(result.gym).toBe('created');
    expect(result.fridges).toEqual({ created: 2, existing: 0 });
    expect(result.dishes).toEqual({ created: 10, existing: 0 });
    expect(result.menuDays.published).toEqual(['2026-03-11', '2026-03-12', '2026-03-13']);
    expect(result.packages).toEqual({ present: [12, 20, 30, 1], created: [] });

    const db = test.app.deps.db;
    expect(db.query('SELECT id, name FROM gyms')).toEqual([{ id: 'demo-gym', name: 'Зал «ДЕМО»' }]);
    const fridges = db.query<Record<string, string | number>>(
      'SELECT id, gym_id, cutoff_time, pickup_from, pickup_to, capacity_boxes FROM fridges ORDER BY id',
    );
    expect(fridges).toHaveLength(2);
    expect(fridges.every((f) => f.gym_id === 'demo-gym')).toBe(true);
    // окна выдачи, сроки приёма и вместимость у холодильников разные
    expect(fridges[0]!.pickup_from).not.toBe(fridges[1]!.pickup_from);
    expect(fridges[0]!.cutoff_time).not.toBe(fridges[1]!.cutoff_time);
    expect(fridges[0]!.capacity_boxes).not.toBe(fridges[1]!.capacity_boxes);

    const dishes = db.query<{ name_ru: string; name_ro: string; shelf_life_hours: number }>(
      'SELECT name_ru, name_ro, shelf_life_hours FROM dishes ORDER BY id',
    );
    expect(dishes).toHaveLength(10);
    expect(dishes.every((d) => d.name_ru.includes('ДЕМО') && d.name_ro.includes('DEMO'))).toBe(
      true,
    );
    expect(new Set(dishes.map((d) => d.name_ru)).size).toBe(10);
    expect(dishes.every((d) => d.shelf_life_hours > 0)).toBe(true);

    // клиент видит меню всех трёх дней через публичный API
    for (const date of ['2026-03-11', '2026-03-12', '2026-03-13']) {
      const menu = await call(test.app, 'GET', `/menu?date=${date}`);
      expect(menu.statusCode).toBe(200);
      expect(menu.json().items).toHaveLength(10);
    }
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join('\n')).toContain('ДЕМО');
  });

  it('повторный запуск ничего не дублирует', async () => {
    const test = await makeApp();
    runSeed(test.app.deps);
    const before = [
      'gyms',
      'fridges',
      'dishes',
      'menu_days',
      'menu_items',
      'packages',
      'admin_audit',
    ].map((table) => count(test, table));
    const second = runSeed(test.app.deps);
    expect(second.gym).toBe('exists');
    expect(second.fridges).toEqual({ created: 0, existing: 2 });
    expect(second.dishes).toEqual({ created: 0, existing: 10 });
    expect(second.menuDays.published).toEqual([]);
    expect(second.menuDays.skipped).toEqual(['2026-03-11', '2026-03-12', '2026-03-13']);
    expect(
      ['gyms', 'fridges', 'dishes', 'menu_days', 'menu_items', 'packages', 'admin_audit'].map(
        (table) => count(test, table),
      ),
    ).toEqual(before);
  });

  it('меню на день, которое администратор уже собрал, не трогает; недостающий стартовый пакет возвращает', async () => {
    const test = await makeApp();
    runSeed(test.app.deps);
    const db = test.app.deps.db;
    db.run('DELETE FROM menu_items WHERE date = ?', ['2026-03-12']);
    db.run('DELETE FROM menu_days WHERE date = ?', ['2026-03-12']);
    db.run('INSERT INTO menu_days (date, published, updated_at) VALUES (?, 0, ?)', [
      '2026-03-12',
      '2026-03-10T09:00:00.000Z',
    ]);
    db.run('INSERT INTO menu_items (date, dish_id, portion_limit, position) VALUES (?, 1, 5, 0)', [
      '2026-03-12',
    ]);
    db.run('DELETE FROM packages WHERE boxes = 30');

    const result = runSeed(test.app.deps);
    expect(result.menuDays.skipped).toContain('2026-03-12');
    expect(db.query('SELECT portion_limit FROM menu_items WHERE date = ?', ['2026-03-12'])).toEqual(
      [{ portion_limit: 5 }],
    );
    expect(result.packages.created).toEqual([30]);
    expect(db.get('SELECT boxes, price_per_box_bani FROM packages WHERE boxes = 30')).toEqual({
      boxes: 30,
      price_per_box_bani: 9900,
    });
  });

  it('в вывод не попадают значения секретов из конфигурации', async () => {
    const config = productionConfig({ SESSION_SECRET: 'canary-secret-value-123' });
    const test = await makeApp({ config });
    const lines: string[] = [];
    runSeed(test.app.deps, (line) => lines.push(line));
    expect(lines.join('\n')).not.toContain('canary-secret-value-123');
  });
});
