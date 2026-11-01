import { describe, expect, it } from 'vitest';
import { ledgerRows } from '../billing/helpers.ts';
import { ordersFor } from '../../src/modules/orders/index.ts';
import {
  addClient,
  balanceOf,
  buyPaid,
  call,
  DAY2,
  makeOrdersApp,
  newKey,
  orderCount,
  placeOk,
  placeOrder,
  portionsLeft,
  rows,
  TOMORROW,
} from './helpers.ts';

describe('отмена заказа до срока (R24, R27)', () => {
  it('освобождает резерв кредитов, порции и места; статус «отменён»', async () => {
    const test = await makeOrdersApp({ capacity: 4, portions: 5 });
    const order = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 3 }] });
    expect(await balanceOf(test)).toBe(9);

    const res = await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect(res.statusCode).toBe(200);
    expect(res.json().order).toMatchObject({
      id: order.id,
      status: 'cancelled',
      code: null,
      canChange: false,
    });

    expect(await balanceOf(test)).toBe(12);
    const entries = ledgerRows(test, test.clientId).filter((r) => r.order_id === order.id);
    expect(entries.filter((r) => r.reason === 'release').reduce((s, r) => s + r.delta, 0)).toBe(3);
    expect(await portionsLeft(test, TOMORROW, test.dishes[0])).toBe(5);
    const info = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${TOMORROW}`,
      test.client,
    );
    expect(info.json().boxesLeft).toBe(4);
  });

  it('повторная отмена безопасна: кредиты не возвращаются дважды', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    const again = await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect(again.statusCode).toBe(200);
    expect(again.json().order.status).toBe('cancelled');
    expect(await balanceOf(test)).toBe(12);
  });

  it('после срока отмена недоступна, заказ и резерв остаются', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    test.clock.set('2026-03-10T16:00:00Z');
    const res = await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('cutoff_passed');
    expect(res.json().error.message).toContain('18:00');
    expect(await balanceOf(test)).toBe(11);
    const list = await call(test, 'GET', '/orders', test.client);
    expect(list.json().upcoming[0]).toMatchObject({
      id: order.id,
      status: 'confirmed',
      canChange: false,
    });
  });

  it('чужой заказ отменить нельзя: 404, у владельца всё на месте', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    const order = await placeOk(test);
    const res = await call(test, 'POST', `/orders/${order.id}/cancel`, other.cookie);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('order_not_found');
    expect(await balanceOf(test)).toBe(11);
  });

  it('загруженный заказ отменить нельзя', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    ordersFor(test.deps).transition(order.id, 'loaded', { kind: 'operator', userId: test.adminId });
    const res = await call(test, 'POST', `/orders/${order.id}/cancel`, test.client);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('order_not_changeable');
    expect(await balanceOf(test)).toBe(11);
  });

  it('вход обязателен', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const res = await call(test, 'POST', `/orders/${order.id}/cancel`);
    expect(res.statusCode).toBe(401);
  });
});

describe('перенос заказа: отмена и новый заказ одним действием (R27)', () => {
  it('отменяет прежний, создаёт новый на другой день, кредиты пересчитываются', async () => {
    const test = await makeOrdersApp();
    const old = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });
    const res = await call(test, 'POST', `/orders/${old.id}/move`, test.client, {
      fridgeId: test.fridgeId,
      date: DAY2,
      items: [
        { dishId: test.dishes[1], qty: 1 },
        { dishId: test.dishes[2], qty: 1 },
      ],
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.cancelledId).toBe(old.id);
    expect(body.order).toMatchObject({ status: 'confirmed', date: DAY2, boxes: 2 });
    expect(body.order.code).toMatch(/^\d{4}$/);

    const list = await call(test, 'GET', '/orders', test.client);
    expect(list.json().upcoming.map((o: { id: string }) => o.id)).toEqual([body.order.id]);
    expect(list.json().past.map((o: { id: string; status: string }) => [o.id, o.status])).toEqual([
      [old.id, 'cancelled'],
    ]);
    expect(await balanceOf(test)).toBe(10); // 12 − 2 нового; прежние 2 вернулись
    expect(await portionsLeft(test, TOMORROW, test.dishes[0])).toBe(30);
    expect(await portionsLeft(test, DAY2, test.dishes[1])).toBe(29);
  });

  it('лимит боксов в день считается без переносимого заказа', async () => {
    const test = await makeOrdersApp();
    const old = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 3 }] });
    const res = await call(test, 'POST', `/orders/${old.id}/move`, test.client, {
      fridgeId: test.fridgeId,
      date: TOMORROW,
      items: [{ dishId: test.dishes[1], qty: 3 }],
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(201);
    expect(await balanceOf(test)).toBe(9);
  });

  it('новый заказ не прошёл: прежний остаётся нетронутым (одна транзакция)', async () => {
    const test = await makeOrdersApp({ portions: 1 });
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    await placeOk(test, other.cookie, { date: DAY2, items: [{ dishId: test.dishes[1], qty: 1 }] });
    const old = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 1 }] });
    const before = rows(test, 'SELECT COUNT(*) AS n FROM credit_ledger')[0];

    const res = await call(test, 'POST', `/orders/${old.id}/move`, test.client, {
      fridgeId: test.fridgeId,
      date: DAY2,
      items: [{ dishId: test.dishes[1], qty: 1 }], // порция уже занята
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('dish_sold_out');
    const list = await call(test, 'GET', '/orders', test.client);
    expect(list.json().upcoming).toHaveLength(1);
    expect(list.json().upcoming[0]).toMatchObject({ id: old.id, status: 'confirmed' });
    expect(await balanceOf(test)).toBe(11);
    expect(rows(test, 'SELECT COUNT(*) AS n FROM credit_ledger')[0]).toEqual(before);
    expect(orderCount(test)).toBe(2);
  });

  it('после срока прежнего заказа перенос недоступен', async () => {
    const test = await makeOrdersApp();
    const old = await placeOk(test);
    test.clock.set('2026-03-10T16:00:00Z');
    const res = await call(test, 'POST', `/orders/${old.id}/move`, test.client, {
      fridgeId: test.fridgeId,
      date: DAY2,
      items: [{ dishId: test.dishes[1], qty: 1 }],
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('cutoff_passed');
    expect(orderCount(test)).toBe(1);
  });

  it('на день, где срок уже вышел, перенести нельзя, прежний заказ остаётся', async () => {
    const test = await makeOrdersApp();
    const old = await placeOk(test, test.client, { date: DAY2 });
    test.clock.set('2026-03-10T16:00:00Z'); // срок на 11 марта вышел, на 12 марта — нет
    const res = await call(test, 'POST', `/orders/${old.id}/move`, test.client, {
      fridgeId: test.fridgeId,
      date: TOMORROW,
      items: [{ dishId: test.dishes[1], qty: 1 }],
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('cutoff_passed');
    const list = await call(test, 'GET', '/orders', test.client);
    expect(list.json().upcoming[0]).toMatchObject({ id: old.id, status: 'confirmed' });
  });

  it('повтор переноса с тем же ключом не создаёт третий заказ', async () => {
    const test = await makeOrdersApp();
    const old = await placeOk(test);
    const body = {
      fridgeId: test.fridgeId,
      date: DAY2,
      items: [{ dishId: test.dishes[1], qty: 1 }],
      idempotencyKey: newKey(),
    };
    const first = await call(test, 'POST', `/orders/${old.id}/move`, test.client, body);
    const second = await call(test, 'POST', `/orders/${old.id}/move`, test.client, body);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().order.id).toBe(first.json().order.id);
    expect(orderCount(test)).toBe(2);
    expect(await balanceOf(test)).toBe(11);
  });

  it('чужой заказ перенести нельзя', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const old = await placeOk(test);
    const res = await call(test, 'POST', `/orders/${old.id}/move`, other.cookie, {
      fridgeId: test.fridgeId,
      date: DAY2,
      items: [{ dishId: test.dishes[1], qty: 1 }],
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('order_not_found');
    expect(orderCount(test)).toBe(1);
  });
});

describe('заказ нельзя оформить заново ключом уже отменённого переноса', () => {
  it('ключ принадлежит новому заказу', async () => {
    const test = await makeOrdersApp();
    const old = await placeOk(test);
    const key = newKey();
    await call(test, 'POST', `/orders/${old.id}/move`, test.client, {
      fridgeId: test.fridgeId,
      date: DAY2,
      items: [{ dishId: test.dishes[1], qty: 1 }],
      idempotencyKey: key,
    });
    const again = await placeOrder(test, test.client, { idempotencyKey: key });
    expect(again.statusCode).toBe(200);
    expect(again.json().order.date).toBe(DAY2);
    expect(orderCount(test)).toBe(2);
  });
});
