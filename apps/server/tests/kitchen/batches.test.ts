import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import { kitchenFor } from '../../src/modules/kitchen/index.ts';
import { ordersFor } from '../../src/modules/orders/index.ts';
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
  type KitchenTest,
} from './helpers.ts';

/** Два блюда заказаны и приём закрыт: A — 3 порции (2 + 1 в разных холодильниках), B — 1. */
async function closedDay(test: KitchenTest) {
  const [a, b] = test.dishes;
  const f2 = await addFridge(test);
  const client2 = await clientWithCredits(test, '+37360555101');
  await placeOk(test, test.client, {
    items: [
      { dishId: a, qty: 2 },
      { dishId: b, qty: 1 },
    ],
  });
  await placeOk(test, client2, { fridgeId: f2, items: [{ dishId: a, qty: 1 }] });
  test.clock.set(CUTOFF_UTC);
  await runCloseJob(test);
  const s = await summary(test);
  const batch = (dishId: number) => s.dishes.find((d) => d.dishId === dishId)!.batch!;
  return { a, b, f2, s, batchA: batch(a), batchB: batch(b) };
}

const post = (test: KitchenTest, path: string, cookie = test.kitchen) =>
  call(test, 'POST', path, cookie);

describe('партия: planned → confirmed → cooked (R32.1)', () => {
  it('после закрытия приёма партии заведены в состоянии planned с читаемыми уникальными кодами', async () => {
    const test = await makeKitchenApp();
    const { a, b, batchA, batchB } = await closedDay(test);
    expect(batchA).toMatchObject({ status: 'planned', plannedQty: 3, bufferQty: 0, totalQty: 3 });
    expect(batchB).toMatchObject({ status: 'planned', plannedQty: 1 });
    expect(batchA.confirmedAt).toBeNull();
    expect(batchA.cookedAt).toBeNull();
    // код: ГГММДД даты выдачи, блюдо, номер партии
    expect(batchA.code).toBe(`260311-D${String(a).padStart(2, '0')}-1`);
    expect(batchB.code).toBe(`260311-D${String(b).padStart(2, '0')}-1`);
    expect(batchA.code).not.toBe(batchB.code);
  });

  it('подтверждение производства, затем «приготовлена»: время и «съесть до» сохраняются', async () => {
    const test = await makeKitchenApp();
    const { batchA } = await closedDay(test);

    // приготовить, не подтвердив производство, нельзя
    const early = await post(test, `/kitchen/batches/${batchA.id}/cooked`);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('invalid_transition');

    test.clock.set('2026-03-10T16:05:00Z');
    const confirmed = await post(test, `/kitchen/batches/${batchA.id}/confirm`);
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().batch).toMatchObject({
      status: 'confirmed',
      confirmedAt: '2026-03-10T16:05:00.000Z',
      cookedAt: null,
    });
    // повтор безопасен и ничего не меняет
    test.clock.set('2026-03-10T16:06:00Z');
    const again = await post(test, `/kitchen/batches/${batchA.id}/confirm`);
    expect(again.json().batch.confirmedAt).toBe('2026-03-10T16:05:00.000Z');

    test.clock.set('2026-03-10T19:30:00Z'); // 21:30 в Кишинёве
    const cooked = await post(test, `/kitchen/batches/${batchA.id}/cooked`);
    expect(cooked.statusCode).toBe(200);
    // срок хранения блюда по умолчанию 72 часа: 19:30 + 3 суток
    expect(cooked.json().batch).toMatchObject({
      status: 'cooked',
      cookedAt: '2026-03-10T19:30:00.000Z',
      eatBy: '2026-03-13T19:30:00.000Z',
    });

    // повтор не сдвигает время приготовления; подтвердить приготовленную нельзя
    test.clock.set('2026-03-10T20:00:00Z');
    const twice = await post(test, `/kitchen/batches/${batchA.id}/cooked`);
    expect(twice.json().batch.cookedAt).toBe('2026-03-10T19:30:00.000Z');
    const back = await post(test, `/kitchen/batches/${batchA.id}/confirm`);
    expect(back.statusCode).toBe(409);

    const s = await summary(test);
    expect(s.dishes.find((d) => d.dishId === batchA.dishId)!.batch).toMatchObject({
      status: 'cooked',
      eatBy: '2026-03-13T19:30:00.000Z',
    });
  });

  it('неизвестная партия — 404', async () => {
    const test = await makeKitchenApp();
    expect((await post(test, '/kitchen/batches/999/confirm')).statusCode).toBe(404);
    expect((await post(test, '/kitchen/batches/abc/cooked')).statusCode).toBe(404);
  });

  it('время приготовления попадает в меню клиента («приготовлено в …»)', async () => {
    const test = await makeKitchenApp();
    const { a, batchA } = await closedDay(test);
    const menuCookedAt = async () => {
      const res = await call(test, 'GET', `/menu?date=${TOMORROW}`);
      return (res.json().items as Array<{ id: number; cookedAt: string | null }>).find(
        (i) => i.id === a,
      )!.cookedAt;
    };
    expect(await menuCookedAt()).toBeNull();
    await post(test, `/kitchen/batches/${batchA.id}/confirm`);
    test.clock.set('2026-03-10T19:30:00Z');
    await post(test, `/kitchen/batches/${batchA.id}/cooked`);
    expect(await menuCookedAt()).toBe('2026-03-10T19:30:00.000Z');
  });

  it('запас на брак входит в партию; подтверждённая партия его больше не меняет', async () => {
    const test = await makeKitchenApp();
    const { batchA, a } = await closedDay(test);
    adminFor(test.deps).setSetting('stockBufferPercent', 50, test.adminId);
    // партия ещё planned: запас пересчитывается (3 × 50% = 1,5 → 2)
    const planned = (await summary(test)).dishes.find((d) => d.dishId === a)!.batch!;
    expect(planned).toMatchObject({ plannedQty: 3, bufferQty: 2, totalQty: 5 });
    await post(test, `/kitchen/batches/${batchA.id}/confirm`);
    adminFor(test.deps).setSetting('stockBufferPercent', 100, test.adminId);
    const fixed = (await summary(test)).dishes.find((d) => d.dishId === a)!;
    expect(fixed.batch).toMatchObject({ status: 'confirmed', bufferQty: 2, totalQty: 5 });
    expect(fixed.buffer).toBe(2);
  });
});

describe('публичный интерфейс для загрузки и отчётов', () => {
  it('batchesFor(fridgeId, date) — партии холодильника с числом порций именно для него', async () => {
    const test = await makeKitchenApp();
    const { a, b, f2, batchA } = await closedDay(test);
    const kitchen = kitchenFor(test.deps);
    const first = kitchen.batchesFor(test.fridgeId, TOMORROW);
    expect(first.map((x) => [x.dishId, x.fridgeQty])).toEqual([
      [a, 2],
      [b, 1],
    ]);
    expect(first[0]).toMatchObject({ id: batchA.id, code: batchA.code, status: 'planned' });
    const second = kitchen.batchesFor(f2, TOMORROW);
    expect(second.map((x) => [x.dishId, x.fridgeQty])).toEqual([[a, 1]]);
    expect(kitchen.batchesFor(test.fridgeId, '2026-03-20')).toEqual([]);
  });

  it('markCooked(batchId) из кода — как кнопка кухни; cookedTotals считает по блюдам и холодильникам', async () => {
    const test = await makeKitchenApp();
    const { a, b, f2, batchA, batchB } = await closedDay(test);
    adminFor(test.deps).setSetting('stockBufferPercent', 50, test.adminId);
    await summary(test); // обновляет запас в партиях planned
    const kitchen = kitchenFor(test.deps);
    expect(kitchen.cookedTotals('2026-03-01', '2026-03-31')).toEqual([]); // ничего не приготовлено

    kitchen.confirmProduction(batchA.id, test.kitchenId);
    kitchen.markCooked(batchA.id, test.kitchenId);
    kitchen.confirmProduction(batchB.id, test.kitchenId);
    kitchen.markCooked(batchB.id, test.kitchenId);

    // после выдачи один заказ клиента списан (A×2 и B×1)
    const orders = ordersFor(test.deps);
    const written = orders
      .listByFridgeDate(test.fridgeId, TOMORROW)
      .find((o) => o.items.length === 2)!;
    orders.transition(written.id, 'written_off', { kind: 'operator', userId: test.kitchenId });

    const rows = kitchen.cookedTotals('2026-03-01', '2026-03-31');
    // A: 2 + 1 по заказам и 2 запаса (3 × 50% = 1,5 → 2); B: 1 + 1 запас (1 × 50% = 0,5 → 1)
    expect(rows).toHaveLength(5); // порядок холодильников случаен: идентификаторы текстовые
    expect(rows).toEqual(
      expect.arrayContaining([
        { date: TOMORROW, dishId: a, fridgeId: test.fridgeId, cooked: 2, writtenOff: 2 },
        { date: TOMORROW, dishId: a, fridgeId: f2, cooked: 1, writtenOff: 0 },
        { date: TOMORROW, dishId: a, fridgeId: null, cooked: 2, writtenOff: 0 },
        { date: TOMORROW, dishId: b, fridgeId: test.fridgeId, cooked: 1, writtenOff: 1 },
        { date: TOMORROW, dishId: b, fridgeId: null, cooked: 1, writtenOff: 0 },
      ]),
    );
    expect(rows.reduce((sum, r) => sum + r.cooked, 0)).toBe(3 + 2 + 1 + 1);
    expect(kitchen.cookedTotals('2026-03-12', '2026-03-31')).toEqual([]);
  });
});
