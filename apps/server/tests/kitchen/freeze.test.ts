import { describe, expect, it } from 'vitest';
import { ordersFor } from '../../src/modules/orders/index.ts';
import { adminFor } from '../../src/modules/admin/index.ts';
import {
  addFridge,
  call,
  clientWithCredits,
  CUTOFF_UTC,
  makeKitchenApp,
  placeOk,
  runCloseJob,
  summary,
  TOMORROW,
} from './helpers.ts';

describe('запас на брак (R32.2)', () => {
  it('процент из настроек прибавляется к плану отдельной строкой, округление вверх; заказы не меняются', async () => {
    const test = await makeKitchenApp();
    const [a, b] = test.dishes;
    const client2 = await clientWithCredits(test, '+37360555101');
    const client3 = await clientWithCredits(test, '+37360555102');
    await placeOk(test, test.client, { items: [{ dishId: a, qty: 3 }] });
    await placeOk(test, client2, { items: [{ dishId: b, qty: 3 }] });
    await placeOk(test, client3, { items: [{ dishId: b, qty: 2 }] });
    adminFor(test.deps).setSetting('stockBufferPercent', 25, test.adminId);

    const s = await summary(test);
    // A: 3 × 25% = 0,75 → 1; B: 5 × 25% = 1,25 → 2
    const byDish = new Map(s.dishes.map((d) => [d.dishId, d]));
    expect(byDish.get(a)).toMatchObject({ planned: 3, buffer: 1, total: 4 });
    expect(byDish.get(b)).toMatchObject({ planned: 5, buffer: 2, total: 7 });
    expect(s.bufferPercent).toBe(25);
    expect(s.totals).toEqual({ planned: 8, buffer: 3, total: 11 });
    // в заказах буфера нет: их по-прежнему 8 боксов
    const boxes = test.deps.db.get<{ n: number }>(
      `SELECT SUM(boxes) AS n FROM orders WHERE status = 'confirmed'`,
    )!.n;
    expect(boxes).toBe(8);
  });
});

describe('срок приёма и фиксация сводки (R32)', () => {
  it('до срока сводка пересчитывается при отмене заказа', async () => {
    const test = await makeKitchenApp();
    const [a] = test.dishes;
    const order = await placeOk(test, test.client, { items: [{ dishId: a, qty: 2 }] });
    expect((await summary(test)).totals.planned).toBe(2);
    await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    const after = await summary(test);
    expect(after.totals.planned).toBe(0);
    expect(after.dishes).toEqual([]);
  });

  it('после срока задача фиксирует сводку, и поздняя отмена её не меняет', async () => {
    const test = await makeKitchenApp();
    const [a, b] = test.dishes;
    const first = await placeOk(test, test.client, { items: [{ dishId: a, qty: 2 }] });
    await placeOk(test, test.client, { items: [{ dishId: b, qty: 1 }] });
    expect((await summary(test)).closed).toBe(false);

    test.clock.set(CUTOFF_UTC); // 18:00 в Кишинёве
    await runCloseJob(test);
    const closed = await summary(test);
    expect(closed.closed).toBe(true);
    expect(closed.fridges[0]).toMatchObject({ closed: true, closedAt: '2026-03-10T16:00:00.000Z' });
    expect(closed.totals.planned).toBe(3);

    // клиент после срока отменить не может; отмена «системой» (например, удаление аккаунта) допустима
    const late = await call(test, 'POST', `/orders/${first.id}/cancel`, test.client);
    expect(late.statusCode).toBe(409);
    ordersFor(test.deps).transition(first.id, 'cancelled', { kind: 'system' });
    expect(ordersFor(test.deps).confirmedItemsByDate(TOMORROW)).toEqual([
      { fridgeId: test.fridgeId, dishId: b, qty: 1 },
    ]);

    test.clock.set('2026-03-10T17:00:00Z');
    const frozen = await summary(test);
    expect(frozen.totals.planned).toBe(3);
    expect(frozen.dishes.find((d) => d.dishId === a)).toMatchObject({ planned: 2 });
    expect(frozen.fridges[0]!.closedAt).toBe('2026-03-10T16:00:00.000Z');
  });

  it('задача идемпотентна и догоняет пропущенное: без работы в нужную минуту сводка закрывается позже', async () => {
    const test = await makeKitchenApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 1 }] });
    const closures = () =>
      test.deps.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM kitchen_closures WHERE date = ?', [
        TOMORROW,
      ])!.n;
    await runCloseJob(test);
    expect(closures()).toBe(0); // срок ещё не наступил

    // процесс простоял двое суток, ни одной минуты 18:00 не было
    test.clock.set('2026-03-12T10:00:00Z');
    await runCloseJob(test);
    const once = closures();
    expect(once).toBeGreaterThan(0);
    const closedAt = test.deps.db.get<{ closed_at: string }>(
      'SELECT closed_at FROM kitchen_closures WHERE date = ? AND fridge_id = ?',
      [TOMORROW, test.fridgeId],
    )!.closed_at;
    await runCloseJob(test);
    expect(closures()).toBe(once);
    expect(
      test.deps.db.get<{ closed_at: string }>(
        'SELECT closed_at FROM kitchen_closures WHERE date = ? AND fridge_id = ?',
        [TOMORROW, test.fridgeId],
      )!.closed_at,
    ).toBe(closedAt);
    expect((await summary(test)).totals.planned).toBe(1);
  });

  it('у холодильников свои сроки: день закрыт, только когда закрыты все', async () => {
    const test = await makeKitchenApp();
    const [a] = test.dishes;
    const late = await addFridge(test, { cutoffTime: '20:30' });
    const client2 = await clientWithCredits(test, '+37360555101');
    await placeOk(test, test.client, { items: [{ dishId: a, qty: 1 }] });
    await placeOk(test, client2, { fridgeId: late, items: [{ dishId: a, qty: 2 }] });

    test.clock.set(CUTOFF_UTC); // 18:00: первый закрыт, второй принимает заказы до 20:30
    await runCloseJob(test);
    const mid = await summary(test);
    expect(mid.closed).toBe(false);
    const state = Object.fromEntries(mid.fridges.map((f) => [f.id, f.closed]));
    expect(state).toEqual({ [test.fridgeId]: true, [late]: false });
    expect(mid.dishes[0]!.batch).toBeNull(); // партий нет, пока приём не закрыт везде

    test.clock.set('2026-03-10T18:30:00Z'); // 20:30
    await runCloseJob(test);
    const done = await summary(test);
    expect(done.closed).toBe(true);
    expect(done.dishes[0]).toMatchObject({ planned: 3 });
    expect(done.dishes[0]!.batch).toMatchObject({ status: 'planned', plannedQty: 3 });
  });
});
