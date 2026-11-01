import { describe, expect, it } from 'vitest';
import { billingFor } from '../../src/modules/billing/index.ts';
import { login, OTHER_PHONE } from '../auth/helpers.ts';
import { journalSum, lotsOf } from '../billing/helpers.ts';
import {
  addClient,
  balanceOf,
  buyPaid,
  call,
  DAY2,
  DAY3,
  DAY_MS,
  makeOrdersApp,
  placeOk,
  placeOrder,
  TOMORROW,
} from './helpers.ts';

// Часы стоят на 10 марта 2026, 11:00 по Кишинёву. Пакет куплен в этот момент и действует 45 дней.

const pause = (
  test: Awaited<ReturnType<typeof makeOrdersApp>>,
  body: Record<string, unknown>,
  cookie: string = test.client,
) => call(test, 'POST', '/pauses', cookie, body);

const lot = (test: Awaited<ReturnType<typeof makeOrdersApp>>) => lotsOf(test, test.clientId)[0]!;

describe('пауза пакета (R27.1)', () => {
  it('сдвигает срок лота ровно на дни паузы; баланс и журнал не меняются', async () => {
    const test = await makeOrdersApp();
    const before = lot(test);
    const res = await pause(test, { lotId: before.id, from: TOMORROW, days: 5 });
    expect(res.statusCode).toBe(201);
    const after = lot(test);
    expect(Date.parse(after.expires_at) - Date.parse(before.expires_at)).toBe(5 * DAY_MS);
    expect(res.json().pause).toMatchObject({
      lotId: before.id,
      from: TOMORROW,
      until: '2026-03-15',
      days: 5,
      expiresAt: after.expires_at,
      previousExpiresAt: before.expires_at,
    });
    expect(await balanceOf(test)).toBe(12);
    expect(journalSum(test, test.clientId)).toBe(12);
  });

  it('кредиты не сгорают на прежний срок: лот живёт до сдвинутого', async () => {
    const test = await makeOrdersApp();
    const original = lot(test);
    await pause(test, { lotId: original.id, from: TOMORROW, days: 14 });
    // на следующий день после прежнего срока лот без паузы уже сгорел бы
    test.clock.set(new Date(Date.parse(original.expires_at) + DAY_MS));
    expect(billingFor(test.deps).balance(test.clientId)).toBe(12);
    // после сдвинутого срока — сгорает
    test.clock.set(new Date(Date.parse(original.expires_at) + 15 * DAY_MS));
    expect(billingFor(test.deps).balance(test.clientId)).toBe(0);
  });

  it('один раз на пакет: повторная пауза отвергается, срок не двигается', async () => {
    const test = await makeOrdersApp();
    const l = lot(test);
    expect((await pause(test, { lotId: l.id, from: TOMORROW, days: 3 })).statusCode).toBe(201);
    const expires = lot(test).expires_at;
    const again = await pause(test, { lotId: l.id, from: DAY3, days: 2 });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('pause_used');
    expect(lot(test).expires_at).toBe(expires);
  });

  it('не больше 14 дней и не меньше 1', async () => {
    const test = await makeOrdersApp();
    const l = lot(test);
    for (const days of [0, 15, -1, 2.5]) {
      const res = await pause(test, { lotId: l.id, from: TOMORROW, days });
      expect(res.statusCode, String(days)).toBe(400);
    }
    expect(lot(test).expires_at).toBe(l.expires_at);
    expect((await pause(test, { lotId: l.id, from: TOMORROW, days: 14 })).statusCode).toBe(201);
  });

  it('недоступна, пока есть подтверждённые заказы на дни паузы', async () => {
    const test = await makeOrdersApp();
    const l = lot(test);
    const order = await placeOk(test, test.client, { date: DAY2 });
    const blocked = await pause(test, { lotId: l.id, from: TOMORROW, days: 3 }); // 11–13 марта
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('pause_has_orders');
    expect(lot(test).expires_at).toBe(l.expires_at);

    // заказ вне дней паузы пауза не задевает
    const free = await pause(test, { lotId: l.id, from: DAY3, days: 2 });
    expect(free.statusCode).toBe(201);
    expect(order.status).toBe('confirmed');
  });

  it('после отмены заказа пауза на эти дни возможна', async () => {
    const test = await makeOrdersApp();
    const l = lot(test);
    const order = await placeOk(test, test.client, { date: DAY2 });
    expect((await pause(test, { lotId: l.id, from: DAY2, days: 1 })).statusCode).toBe(409);
    await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect((await pause(test, { lotId: l.id, from: DAY2, days: 1 })).statusCode).toBe(201);
  });

  it('на дни паузы новый заказ не оформляется', async () => {
    const test = await makeOrdersApp();
    const l = lot(test);
    await pause(test, { lotId: l.id, from: DAY2, days: 2 }); // 12–13 марта
    const blocked = await placeOrder(test, test.client, { date: DAY3 });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('paused_day');
    const info = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${DAY3}`,
      test.client,
    );
    expect(info.json().closedReason).toBe('paused');
    // день до паузы свободен
    expect((await placeOrder(test, test.client, { date: TOMORROW })).statusCode).toBe(201);
  });

  it('чужой пакет поставить на паузу нельзя; неизвестный — тоже', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const l = lot(test);
    const foreign = await pause(test, { lotId: l.id, from: TOMORROW, days: 2 }, other.cookie);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe('pause_lot_not_found');
    const unknown = await pause(test, { lotId: 99999, from: TOMORROW, days: 2 });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('pause_lot_not_found');
    expect(lot(test).expires_at).toBe(l.expires_at);
  });

  it('пакет без остатка или с вышедшим сроком на паузу не ставится', async () => {
    const test = await makeOrdersApp({ credits: 1 });
    const l = lot(test);
    await placeOk(test); // единственный кредит ушёл в резерв
    const empty = await pause(test, { lotId: l.id, from: TOMORROW, days: 2 });
    expect(empty.statusCode).toBe(409);
    expect(empty.json().error.code).toBe('pause_expired');

    const second = await makeOrdersApp();
    const l2 = lotsOf(second, second.clientId)[0]!;
    second.clock.set(new Date(Date.parse(l2.expires_at) + DAY_MS));
    // сессия клиента живёт 30 дней, а срок лота 45: входим заново
    const cookie = await login(second, OTHER_PHONE);
    const late = await pause(second, { lotId: l2.id, from: '2026-04-30', days: 2 }, cookie);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('pause_expired');
  });

  it('начало паузы: не раньше сегодняшнего дня и не позже конца срока пакета', async () => {
    const test = await makeOrdersApp();
    const l = lot(test);
    const past = await pause(test, { lotId: l.id, from: '2026-03-09', days: 2 });
    expect(past.statusCode).toBe(409);
    expect(past.json().error.code).toBe('pause_start');
    const far = await pause(test, { lotId: l.id, from: '2026-12-01', days: 2 });
    expect(far.statusCode).toBe(409);
    expect(far.json().error.code).toBe('pause_start');
    expect(lot(test).expires_at).toBe(l.expires_at);
  });

  it('список пауз клиента', async () => {
    const test = await makeOrdersApp();
    const empty = await call(test, 'GET', '/pauses', test.client);
    expect(empty.json().items).toEqual([]);
    const l = lot(test);
    await pause(test, { lotId: l.id, from: TOMORROW, days: 2 });
    const list = await call(test, 'GET', '/pauses', test.client);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0]).toMatchObject({
      lotId: l.id,
      from: TOMORROW,
      until: DAY2,
      days: 2,
    });
  });

  it('вход обязателен', async () => {
    const test = await makeOrdersApp();
    const res = await call(test, 'POST', '/pauses', undefined, {
      lotId: 1,
      from: TOMORROW,
      days: 1,
    });
    expect(res.statusCode).toBe(401);
  });
});
