import { describe, expect, it } from 'vitest';
import { billingFor } from '../../src/modules/billing/index.ts';
import { fulfillmentFor } from '../../src/modules/fulfillment/index.ts';
import { kitchenFor } from '../../src/modules/kitchen/index.ts';
import { authFor } from '../../src/modules/auth/index.ts';
import { login, setRole, userId } from '../auth/helpers.ts';
import { addFridge } from '../kitchen/helpers.ts';
import {
  call,
  clientWithCredits,
  closeIntake,
  cookAll,
  dayOf,
  makeFulfillmentApp,
  markLoaded,
  OTHER_OPERATOR_PHONE,
  pickupByCode,
  PICKUP_MORNING,
  PICKUP_NIGHT,
  placeOk,
  statusOf,
  TOMORROW,
  type FulfillmentTest,
} from './helpers.ts';

const closeDay = (
  test: FulfillmentTest,
  body: Record<string, unknown>,
  cookie: string = test.operator,
  fridgeId: string = test.fridgeId,
) =>
  call(test, 'POST', `/operator/fridges/${fridgeId}/close-day`, cookie, {
    date: TOMORROW,
    ...body,
  });

const runJob = (test: FulfillmentTest) =>
  test.app.deps.system.scheduler.runNow('fulfillment-close-day');

const rows = (test: FulfillmentTest, sql: string, params: Array<string | number> = []) =>
  test.deps.db.query<Record<string, unknown>>(sql, params);

/** Два клиента: у первого 3 бокса (A×2, B×1), у второго 1 бокс A. Приём закрыт, партии готовы, загружено. */
async function twoOrders(test: FulfillmentTest) {
  const [a, b] = test.dishes;
  const first = await placeOk(test, test.client, {
    items: [
      { dishId: a, qty: 2 },
      { dishId: b, qty: 1 },
    ],
  });
  const secondCookie = await clientWithCredits(test, '+37360555104');
  const second = await placeOk(test, secondCookie, { items: [{ dishId: a, qty: 1 }] });
  await closeIntake(test);
  await cookAll(test);
  expect((await markLoaded(test)).statusCode).toBe(200);
  return { a, b, first, second, secondCookie };
}

describe('закрытие дня оператором (R35, R35.1, R40)', () => {
  it('невыданный заказ списывается без возврата кредита, лишний бокс — отдельной строкой; отчёт сходится', async () => {
    const test = await makeFulfillmentApp();
    const { a, b, first, second, secondCookie } = await twoOrders(test);

    test.clock.set(PICKUP_MORNING);
    expect((await pickupByCode(test, first.code!)).statusCode).toBe(200);
    const balanceBefore = (await call(test, 'GET', '/credits', secondCookie)).json().balance;

    test.clock.set(PICKUP_NIGHT); // 22:30: окно закрыто, можно закрывать
    // в холодильнике 2 бокса: 1 невыданный по заказу и 1 лишний (брак блюда B)
    const res = await closeDay(test, {
      remaining: 2,
      extras: [{ dishId: b, qty: 1, reason: 'defect' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      alreadyClosed: false,
      closure: { source: 'operator', remaining: 2, writtenOffOrders: 1, writtenOffExtra: 1 },
    });

    // выданный остался выданным, невыданный списан
    expect(statusOf(test, first.id)).toBe('picked_up');
    expect(statusOf(test, second.id)).toBe('written_off');

    // кредит остаётся потраченным: баланс не вырос, release невозможен, consume записан
    expect((await call(test, 'GET', '/credits', secondCookie)).json().balance).toBe(balanceBefore);
    expect(() => billingFor(test.deps).release(second.id)).toThrowError(/reservation_consumed/);
    expect(
      rows(test, "SELECT 1 FROM credit_ledger WHERE order_id = ? AND reason = 'release'", [
        second.id,
      ]),
    ).toHaveLength(0);
    expect(
      rows(test, "SELECT 1 FROM credit_ledger WHERE order_id = ? AND reason = 'consume'", [
        second.id,
      ]),
    ).toHaveLength(1);
    // исключение — решение по жалобе: тогда кредит добавляется отдельной записью
    billingFor(test.deps).grantComplaintCredit(
      test.deps.db.get<{ user_id: number }>('SELECT user_id FROM orders WHERE id = ?', [second.id])!
        .user_id,
      'complaint-1',
    );
    expect((await call(test, 'GET', '/credits', secondCookie)).json().balance).toBe(
      balanceBefore + 1,
    );

    // списанный заказ по коду не выдаётся
    const late = await pickupByCode(test, second.code!);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('order_written_off');

    // для отчётов: списание по заказу (блюдо A, не забрали) и без заказа (блюдо B, брак)
    expect(fulfillmentFor(test.deps).writeOffTotals(TOMORROW, TOMORROW)).toEqual([
      { date: TOMORROW, fridgeId: test.fridgeId, dishId: a, reason: 'not_picked_up', qty: 1 },
      { date: TOMORROW, fridgeId: test.fridgeId, dishId: b, reason: 'defect', qty: 1 },
    ]);
    // кухня видит списание по заказам в своих итогах
    const kitchenRow = kitchenFor(test.deps)
      .cookedTotals(TOMORROW, TOMORROW)
      .find((r) => r.dishId === a && r.fridgeId === test.fridgeId);
    expect(kitchenRow?.writtenOff).toBe(1);

    // день закрыт: график показывает закрытие, загрузка и повторное закрытие ничего не меняют
    expect((await dayOf(test)).json().closure).toMatchObject({ source: 'operator', remaining: 2 });
    const again = await closeDay(test, { remaining: 9 });
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyClosed).toBe(true);
    expect(rows(test, 'SELECT * FROM write_offs')).toHaveLength(1);
    expect(rows(test, 'SELECT * FROM order_write_offs')).toHaveLength(1);
    expect((await markLoaded(test)).json().error.code).toBe('day_closed');
  });

  it('причина по умолчанию «не забрали»; для отдельного заказа можно указать другую', async () => {
    const test = await makeFulfillmentApp();
    const { first, second } = await twoOrders(test);
    test.clock.set(PICKUP_NIGHT);
    const res = await closeDay(test, {
      remaining: 4,
      orders: [{ orderId: second.id, reason: 'expired' }],
    });
    expect(res.statusCode).toBe(200);
    const reasons = Object.fromEntries(
      rows(test, 'SELECT order_id, reason FROM order_write_offs').map((r) => [
        r.order_id,
        r.reason,
      ]),
    );
    expect(reasons).toEqual({ [first.id]: 'not_picked_up', [second.id]: 'expired' });
  });

  it('лишние боксы без указания блюда пишутся строкой без блюда с причиной закрытия', async () => {
    const test = await makeFulfillmentApp();
    await twoOrders(test); // в холодильнике должны остаться 4 бокса
    test.clock.set(PICKUP_NIGHT);
    const res = await closeDay(test, { remaining: 6, reason: 'other' });
    expect(res.statusCode).toBe(200);
    const extra = rows(test, 'SELECT dish_id, reason, qty, fridge_id FROM write_offs');
    expect(extra).toEqual([{ dish_id: null, reason: 'other', qty: 2, fridge_id: test.fridgeId }]);
  });

  it('сумма лишних боксов должна совпасть с остатком: иначе 400 и ничего не списано', async () => {
    const test = await makeFulfillmentApp();
    const { first } = await twoOrders(test);
    test.clock.set(PICKUP_NIGHT);
    const res = await closeDay(test, {
      remaining: 5,
      extras: [{ dishId: null, qty: 3, reason: 'defect' }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('extras_mismatch');
    expect(statusOf(test, first.id)).toBe('loaded');
    expect(rows(test, 'SELECT * FROM day_closures')).toHaveLength(0);
    // неизвестный заказ и неверная причина отвергаются
    expect(
      (await closeDay(test, { remaining: 4, orders: [{ orderId: 'nope', reason: 'defect' }] }))
        .statusCode,
    ).toBe(400);
    expect((await closeDay(test, { remaining: 4, reason: 'lost' })).statusCode).toBe(400);
    expect((await closeDay(test, { remaining: -1 })).statusCode).toBe(400);
  });

  it('пока идёт окно выдачи и в будущем закрыть день нельзя; чужой холодильник — 403', async () => {
    const test = await makeFulfillmentApp();
    const { first } = await twoOrders(test);

    test.clock.set('2026-03-11T13:00:00Z'); // 15:00 — окно открыто до 22:00
    const early = await closeDay(test, { remaining: 4 });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('window_open');
    expect(early.json().error.message).toContain('22:00');

    test.clock.set(CUTOFF_BEFORE_DAY);
    const future = await closeDay(test, { remaining: 4 });
    expect(future.statusCode).toBe(409);
    expect(future.json().error.code).toBe('date_out_of_range');

    test.clock.set(PICKUP_NIGHT);
    const second = await addFridge(test);
    const other = await login(test, OTHER_OPERATOR_PHONE);
    setRole(test.app, OTHER_OPERATOR_PHONE, 'operator');
    authFor(test.app.deps).setOperatorFridges(userId(test.app, OTHER_OPERATOR_PHONE), [second]);
    expect((await closeDay(test, { remaining: 4 }, other)).statusCode).toBe(403);
    expect(statusOf(test, first.id)).toBe('loaded');
    expect((await closeDay(test, { remaining: 4 }, test.client)).statusCode).toBe(403);
  });
});

/** Вечер 10 марта: сам день выдачи (11 марта) ещё впереди. */
const CUTOFF_BEFORE_DAY = '2026-03-10T17:00:00Z';

describe('автозакрытие дня в 23:59 по Кишинёву (R35)', () => {
  it('задача зарегистрирована и до 23:59 день не трогает', async () => {
    const test = await makeFulfillmentApp();
    expect(test.app.deps.system.scheduler.list().map((j) => j.name)).toContain(
      'fulfillment-close-day',
    );
    const { second } = await twoOrders(test);
    test.clock.set('2026-03-11T21:58:00Z'); // 23:58
    await runJob(test);
    expect(statusOf(test, second.id)).toBe('loaded');
    expect(rows(test, 'SELECT * FROM day_closures')).toHaveLength(0);
  });

  it('в 23:59 невыданные заказы списываются без возврата кредита; повторный запуск ничего не меняет', async () => {
    const test = await makeFulfillmentApp();
    const { first, second, secondCookie } = await twoOrders(test);
    test.clock.set(PICKUP_MORNING);
    await pickupByCode(test, first.code!);
    const balanceBefore = (await call(test, 'GET', '/credits', secondCookie)).json().balance;

    test.clock.set('2026-03-11T21:59:00Z'); // 23:59
    await runJob(test);
    expect(statusOf(test, first.id)).toBe('picked_up');
    expect(statusOf(test, second.id)).toBe('written_off');
    expect(rows(test, 'SELECT source, remaining_boxes FROM day_closures')).toEqual([
      { source: 'system', remaining_boxes: null },
    ]);
    expect(rows(test, 'SELECT reason, source FROM order_write_offs')).toEqual([
      { reason: 'not_picked_up', source: 'system' },
    ]);
    expect((await call(test, 'GET', '/credits', secondCookie)).json().balance).toBe(balanceBefore);

    await runJob(test);
    expect(rows(test, 'SELECT * FROM order_write_offs')).toHaveLength(1);
    expect(rows(test, 'SELECT * FROM day_closures')).toHaveLength(1);
  });

  it('пропущенные дни догоняются: через несколько дней задача закрывает старый день', async () => {
    const test = await makeFulfillmentApp();
    const { second } = await twoOrders(test);
    test.clock.set('2026-03-14T08:00:00Z'); // три дня спустя, 10:00 — процесс был выключен
    await runJob(test);
    expect(statusOf(test, second.id)).toBe('written_off');
    expect(rows(test, 'SELECT date, source FROM day_closures')).toEqual([
      { date: TOMORROW, source: 'system' },
    ]);
  });

  it('догоняет и день, в котором холодильник так и не загрузили: заказы списываются', async () => {
    const test = await makeFulfillmentApp();
    const order = await placeOk(test);
    await closeIntake(test); // партии не готовили, загрузки не было
    test.clock.set('2026-03-14T08:00:00Z');
    await runJob(test);
    expect(statusOf(test, order.id)).toBe('written_off');
    expect(rows(test, 'SELECT reason FROM order_write_offs')).toEqual([
      { reason: 'not_picked_up' },
    ]);
  });

  it('не трогает уже закрытый оператором день и холодильник без невыданных заказов', async () => {
    const test = await makeFulfillmentApp();
    const { first } = await twoOrders(test);
    test.clock.set(PICKUP_NIGHT);
    await closeDay(test, { remaining: 4, orders: [{ orderId: first.id, reason: 'defect' }] });
    test.clock.set('2026-03-11T21:59:00Z');
    await runJob(test);
    expect(rows(test, 'SELECT source FROM day_closures')).toEqual([{ source: 'operator' }]);
    expect(rows(test, 'SELECT reason FROM order_write_offs ORDER BY reason')).toEqual([
      { reason: 'defect' },
      { reason: 'not_picked_up' },
    ]);
  });
});

describe('списания для отчётов', () => {
  it('период проверяется: начало не позже конца и не больше года', async () => {
    const test = await makeFulfillmentApp();
    const api = fulfillmentFor(test.deps);
    expect(() => api.writeOffTotals('2026-03-12', '2026-03-11')).toThrowError(/bad_range/);
    expect(() => api.writeOffTotals('2024-01-01', '2026-03-11')).toThrowError(/bad_range/);
    expect(api.writeOffTotals('2026-03-01', '2026-03-31')).toEqual([]);
  });
});
