import { describe, expect, it } from 'vitest';
import {
  addClient,
  buyPaid,
  call,
  makeOrdersApp,
  orderCount,
  placeOrder,
  TODAY,
  TOMORROW,
} from './helpers.ts';

// 10 марта 2026 в Кишинёве зима (+2 часа): 18:00 местного времени = 16:00 UTC.

describe('срок приёма заказов (R39, R42)', () => {
  it('до 18:00 накануне заказ принимается, с 18:00 — нет', async () => {
    const test = await makeOrdersApp();
    test.clock.set('2026-03-10T15:59:59Z'); // 17:59:59 в Кишинёве
    const ok = await placeOrder(test);
    expect(ok.statusCode).toBe(201);

    test.clock.set('2026-03-10T16:00:00Z'); // 18:00:00
    const late = await placeOrder(test);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('cutoff_passed');
    expect(late.json().error.message).toContain('18:00');
    expect(orderCount(test)).toBe(1);
  });

  it('срок настраивается по холодильнику', async () => {
    const test = await makeOrdersApp({ cutoffTime: '20:30' });
    test.clock.set('2026-03-10T18:29:00Z'); // 20:29 в Кишинёве
    expect((await placeOrder(test)).statusCode).toBe(201);
    test.clock.set('2026-03-10T18:30:00Z'); // 20:30
    const late = await placeOrder(test);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.message).toContain('20:30');
  });

  it('срок считается по Кишинёву, а не по UTC: 21:30 UTC уже на следующий день по часам зала', async () => {
    const test = await makeOrdersApp();
    // 23:30 по Кишинёву 10 марта: срок на 11 марта давно вышел, до полуночи тоже заказать нельзя
    test.clock.set('2026-03-10T21:30:00Z');
    const res = await placeOrder(test);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('cutoff_passed');
  });

  it('availability показывает закрытый приём с причиной и момент срока', async () => {
    const test = await makeOrdersApp();
    const open = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${TOMORROW}`,
      test.client,
    );
    expect(open.json()).toMatchObject({
      closedReason: null,
      cutoffTime: '18:00',
      cutoffAt: '2026-03-10T16:00:00.000Z',
      maxBoxesPerDay: 3,
    });
    test.clock.set('2026-03-10T16:00:00Z');
    const closed = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${TOMORROW}`,
      test.client,
    );
    expect(closed.json().closedReason).toBe('cutoff');
  });
});

describe('только предзаказ: на сегодня и прошлое заказать нельзя (договорённость с владельцем)', () => {
  it('на сегодняшнюю дату заказ невозможен, даже если в меню есть блюдо', async () => {
    const test = await makeOrdersApp({ menuDates: [TODAY, TOMORROW] });
    test.clock.set('2026-03-10T05:00:00Z'); // раннее утро 10 марта
    const res = await placeOrder(test, test.client, { date: TODAY });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('date_not_future');
    expect(orderCount(test)).toBe(0);

    const info = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${TODAY}`,
      test.client,
    );
    expect(info.json().closedReason).toBe('date');
  });

  it('на прошедшую дату — тоже нет', async () => {
    const test = await makeOrdersApp();
    const res = await placeOrder(test, test.client, { date: '2026-03-01' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('date_not_future');
  });

  it('после полуночи «завтра» сдвигается: вчерашний заказ на «сегодня» невозможен', async () => {
    const test = await makeOrdersApp();
    test.clock.set('2026-03-10T22:30:00Z'); // 11 марта 00:30 в Кишинёве
    const res = await placeOrder(test, test.client, { date: TOMORROW });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('date_not_future');
  });
});

describe('срок при переводе часов, весна 2027 (R39.1)', () => {
  // Молдова переводит часы в последнее воскресенье марта: 28 марта 2027 в 03:00 -> 04:00.
  // До перевода пояс +2, после — +3.

  async function app() {
    const test = await makeOrdersApp({
      start: '2027-03-26T09:00:00Z',
      menuDates: ['2027-03-28', '2027-03-29'],
    });
    return test;
  }

  it('заказ на 28 марта: срок 18:00 27 марта по зимнему времени (16:00 UTC)', async () => {
    const test = await app();
    test.clock.set('2027-03-27T15:59:00Z');
    const ok = await placeOrder(test, test.client, { date: '2027-03-28' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().order.cutoffAt).toBe('2027-03-27T16:00:00.000Z');
    test.clock.set('2027-03-27T16:00:00Z');
    const late = await placeOrder(test, test.client, {
      date: '2027-03-28',
      items: [{ dishId: test.dishes[1], qty: 1 }],
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('cutoff_passed');
  });

  it('заказ на 29 марта: срок 18:00 28 марта уже по летнему времени (15:00 UTC), а не 16:00', async () => {
    const test = await app();
    test.clock.set('2027-03-28T14:59:00Z'); // 17:59 в Кишинёве (+3)
    const ok = await placeOrder(test, test.client, { date: '2027-03-29' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().order.cutoffAt).toBe('2027-03-28T15:00:00.000Z');

    test.clock.set('2027-03-28T15:00:00Z'); // 18:00 (+3): приём закрыт
    const late = await placeOrder(test, test.client, {
      date: '2027-03-29',
      items: [{ dishId: test.dishes[1], qty: 1 }],
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('cutoff_passed');
    // если бы пояс считался как +2, в 15:30 UTC заказ ещё приняли бы
    test.clock.set('2027-03-28T15:30:00Z');
    const stillLate = await placeOrder(test, test.client, {
      date: '2027-03-29',
      items: [{ dishId: test.dishes[2], qty: 1 }],
    });
    expect(stillLate.statusCode).toBe(409);
  });

  it('отмена на 29 марта тоже действует до 15:00 UTC', async () => {
    const test = await app();
    test.clock.set('2027-03-28T10:00:00Z');
    const order = (await placeOrder(test, test.client, { date: '2027-03-29' })).json().order;
    test.clock.set('2027-03-28T15:00:00Z');
    const res = await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('cutoff_passed');
  });

  it('отказ после срока не трогает баланс', async () => {
    const test = await app();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 1);
    test.clock.set('2027-03-28T15:00:00Z');
    const res = await placeOrder(test, other.cookie, { date: '2027-03-29' });
    expect(res.statusCode).toBe(409);
    const balance = (await call(test, 'GET', '/credits', other.cookie)).json().balance;
    expect(balance).toBe(1);
  });
});
