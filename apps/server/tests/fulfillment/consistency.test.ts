// Согласованность данных кухни и выдачи (F1.10): срок приёма нельзя двигать под готовую сводку,
// холодильник с будущими заказами нельзя выключить, загрузка сверяет готовые порции с заказами.
import { describe, expect, it } from 'vitest';
import { kitchenFor } from '../../src/modules/kitchen/index.ts';
import {
  call,
  closeIntake,
  cookAll,
  loadedDay,
  makeFulfillmentApp,
  markLoaded,
  placeOk,
  statusOf,
  TOMORROW,
} from './helpers.ts';

const patchFridge = (
  test: Awaited<ReturnType<typeof makeFulfillmentApp>>,
  body: Record<string, unknown>,
) => call(test, 'PATCH', `/admin/fridges/${test.fridgeId}`, test.admin, body);

describe('смена срока приёма заказов под готовую сводку кухни', () => {
  it('на дату с зафиксированной сводкой срок менять нельзя: 409 с датой, значение не меняется', async () => {
    const test = await makeFulfillmentApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0]!, qty: 1 }] });
    await closeIntake(test);

    const before = test.app.deps.db.get<{ cutoff_time: string }>(
      'SELECT cutoff_time FROM fridges WHERE id = ?',
      [test.fridgeId],
    )!.cutoff_time;
    const res = await patchFridge(test, { cutoffTime: before === '12:00' ? '13:00' : '12:00' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('fridge_snapshot_locked');
    expect(res.json().error.message).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(
      test.app.deps.db.get<{ cutoff_time: string }>(
        'SELECT cutoff_time FROM fridges WHERE id = ?',
        [test.fridgeId],
      )!.cutoff_time,
    ).toBe(before);
  });

  it('тот же срок (форма отправила его без изменений) и другие поля правятся свободно', async () => {
    const test = await makeFulfillmentApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0]!, qty: 1 }] });
    await closeIntake(test);
    const current = test.app.deps.db.get<{ cutoff_time: string }>(
      'SELECT cutoff_time FROM fridges WHERE id = ?',
      [test.fridgeId],
    )!.cutoff_time;
    const res = await patchFridge(test, { cutoffTime: current, name: 'Новое имя' });
    expect(res.statusCode).toBe(200);
  });

  it('планировщик уже создал пустые записи на сегодня и прошлые даты — они срок не блокируют; запись на завтра блокирует', async () => {
    const test = await makeFulfillmentApp(); // 10 марта, 11:00 по Кишинёву: срок на завтра (18:00) ещё не наступил
    const db = test.app.deps.db;
    kitchenFor(test.app.deps).closeDue(); // то же, что раз в минуту делает kitchen-close: даты от −7 до +2
    const dates = db
      .query<{ date: string }>(
        'SELECT date FROM kitchen_closures WHERE fridge_id = ? ORDER BY date',
        [test.fridgeId],
      )
      .map((r) => r.date);
    expect(dates.length).toBeGreaterThan(0); // записи есть, иначе тест ничего не доказывает
    expect(dates).toContain('2026-03-10');
    expect(dates.every((d) => d <= '2026-03-10')).toBe(true);

    const ok = await patchFridge(test, { cutoffTime: '19:30' });
    expect(ok.statusCode).toBe(200);

    // снимок на завтра (срок приёма наступил, сводка зафиксирована) по-прежнему блокирует
    test.clock.set('2026-03-11T05:00:00Z'); // для даты 12 марта срок (11 марта 19:30) ещё не наступил
    await placeOk(test, test.client, {
      items: [{ dishId: test.dishes[0]!, qty: 1 }],
      date: '2026-03-12',
    });
    test.clock.set('2026-03-11T17:45:00Z'); // 19:45 по Кишинёву: срок на 12 марта прошёл
    kitchenFor(test.app.deps).closeDue();
    const blocked = await patchFridge(test, { cutoffTime: '20:30' });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('fridge_snapshot_locked');
    expect(blocked.json().error.message).toContain('2026-03-12');
  });

  it('без сводки срок меняется как раньше', async () => {
    const test = await makeFulfillmentApp();
    const res = await patchFridge(test, { cutoffTime: '19:30' });
    expect(res.statusCode).toBe(200);
    expect(res.json().cutoffTime).toBe('19:30');
  });
});

describe('выключение холодильника с будущими заказами', () => {
  it('подтверждённый заказ на сегодня или будущее — 409; после отмены заказа выключить можно', async () => {
    const test = await makeFulfillmentApp();
    const order = await placeOk(test, test.client, {
      items: [{ dishId: test.dishes[0]!, qty: 1 }],
    });

    const blocked = await patchFridge(test, { active: false });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('fridge_has_orders');
    expect(blocked.json().error.message).toMatch(/1/);
    expect(
      test.app.deps.db.get<{ active: number }>('SELECT active FROM fridges WHERE id = ?', [
        test.fridgeId,
      ])!.active,
    ).toBe(1);

    const cancel = await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect(cancel.statusCode).toBe(200);
    expect((await patchFridge(test, { active: false })).statusCode).toBe(200);
  });

  it('заказы на прошедшие даты и уже выданные не мешают', async () => {
    const test = await makeFulfillmentApp();
    const order = await placeOk(test, test.client, {
      items: [{ dishId: test.dishes[0]!, qty: 1 }],
    });
    test.app.deps.db.run("UPDATE orders SET status = 'picked_up' WHERE id = ?", [order.id]);
    expect((await patchFridge(test, { active: false })).statusCode).toBe(200);
  });
});

describe('«загружено» сверяет готовые порции с подтверждёнными', () => {
  it('приготовлено меньше, чем заказано: 409, заказы остаются подтверждёнными; после исправления грузится', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test, { load: false });
    const [a] = test.dishes;
    const batch = test.app.deps.db.get<{ id: number; planned_qty: number; buffer_qty: number }>(
      'SELECT id, planned_qty, buffer_qty FROM kitchen_batches WHERE date = ? AND dish_id = ?',
      [TOMORROW, a],
    )!;
    expect(batch.planned_qty).toBe(2);
    // кухня приготовила на порцию меньше, чем нужно по заказам (в партии 1 из 2)
    test.app.deps.db.run(
      'UPDATE kitchen_batches SET planned_qty = 1, buffer_qty = 0 WHERE id = ?',
      [batch.id],
    );

    const res = await markLoaded(test);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('batch_short');
    expect(res.json().error.message).toContain('Курица с рисом');
    expect(statusOf(test, orderId)).toBe('confirmed');

    test.app.deps.db.run('UPDATE kitchen_batches SET planned_qty = 2 WHERE id = ?', [batch.id]);
    expect((await markLoaded(test)).statusCode).toBe(200);
    expect(statusOf(test, orderId)).toBe('loaded');
  });

  it('запас на брак покрывает нехватку по плану', async () => {
    const test = await makeFulfillmentApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0]!, qty: 2 }] });
    await closeIntake(test);
    await cookAll(test);
    test.app.deps.db.run(
      'UPDATE kitchen_batches SET planned_qty = 1, buffer_qty = 1 WHERE dish_id = ? AND date = ?',
      [test.dishes[0]!, TOMORROW],
    );
    expect((await markLoaded(test)).statusCode).toBe(200);
  });
});
