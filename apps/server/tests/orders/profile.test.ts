// Заказы и профиль: выгрузка данных клиента (R29.1) и удаление аккаунта (R29).
import { describe, expect, it } from 'vitest';
import { billingFor } from '../../src/modules/billing/index.ts';
import { profileFor } from '../../src/modules/profile/index.ts';
import { ordersFor } from '../../src/modules/orders/index.ts';
import {
  addClient,
  buyPaid,
  call,
  DAY3,
  makeOrdersApp,
  placeOk,
  portionsLeft,
  rows,
  TOMORROW,
} from './helpers.ts';

describe('провайдер выгрузки «orders»', () => {
  it('в выгрузке клиента только его заказы: дата, холодильник, блюда, статус', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const mine = await placeOk(test, test.client, {
      items: [
        { dishId: test.dishes[0], qty: 2 },
        { dishId: test.dishes[1], qty: 1 },
      ],
    });
    const cancelled = await placeOk(test, test.client, { date: DAY3 });
    await call(test, 'POST', `/orders/${cancelled.id}/cancel`, test.client);
    const foreign = await placeOk(test, other.cookie, {
      items: [{ dishId: test.dishes[2], qty: 1 }],
    });

    const res = await call(test, 'GET', '/profile/export', test.client);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Object.keys(data)).toContain('orders');
    const items = data.orders.items as Array<{
      date: string;
      fridge: { id: string; name: string };
      status: string;
      items: Array<{ dishId: number; qty: number; name: { ru: string; ro: string } }>;
    }>;
    expect(items).toHaveLength(2);
    const first = items.find((o) => o.date === TOMORROW)!;
    expect(first.status).toBe('confirmed');
    expect(first.fridge).toEqual({ id: test.fridgeId, name: 'Холодильник у входа' });
    expect(first.items).toEqual([
      { dishId: test.dishes[0], qty: 2, name: { ru: 'Курица с рисом', ro: 'Pui cu orez' } },
      { dishId: test.dishes[1], qty: 1, name: { ru: 'Лосось с овощами', ro: 'Somon cu legume' } },
    ]);
    expect(items.find((o) => o.date === DAY3)!.status).toBe('cancelled');

    // чужих заказов, их идентификаторов и кодов в файле нет
    const text = res.body;
    expect(text).not.toContain(foreign.id);
    expect(text).not.toContain('Овсянка с ягодами');
    expect(text).toContain(mine.id);
  });

  it('у клиента без заказов — пустой список', async () => {
    const test = await makeOrdersApp();
    const res = await call(test, 'GET', '/profile/export', test.client);
    expect(res.json().data.orders).toEqual({ items: [] });
  });
});

describe('хук удаления аккаунта «orders»', () => {
  it('будущие подтверждённые заказы отменяются, резерв освобождается, прошлые остаются без привязки к человеку', async () => {
    const test = await makeOrdersApp();
    const past = await placeOk(test, test.client, { date: TOMORROW });
    const future = await placeOk(test, test.client, {
      date: DAY3,
      items: [{ dishId: test.dishes[0], qty: 2 }],
    });
    const futureTwo = await placeOk(test, test.client, {
      date: DAY3,
      items: [{ dishId: test.dishes[1], qty: 1 }],
    });
    expect(billingFor(test.deps).orderCredits(future.id).held).toBe(2);

    test.clock.set('2026-03-12T10:00:00Z'); // 11 марта прошло, 13-е ещё впереди
    const res = await call(test, 'POST', '/profile/account/delete', test.client, { confirm: true });
    expect(res.statusCode).toBe(200);

    const status = (id: string) => ordersFor(test.deps).get(id)?.status;
    expect(status(future.id)).toBe('cancelled');
    expect(status(futureTwo.id)).toBe('cancelled');
    expect(billingFor(test.deps).orderCredits(future.id).held).toBe(0);
    expect(billingFor(test.deps).orderCredits(futureTwo.id).held).toBe(0);
    // прошлый заказ остался как был
    expect(status(past.id)).toBe('confirmed');
    expect(billingFor(test.deps).orderCredits(past.id).held).toBe(1);
    // порции будущих заказов освобождены
    expect(await portionsLeft(test, DAY3, test.dishes[0])).toBe(30);
    // человека за заказами больше нет: телефона и роли у пользователя нет
    const owner = rows<{ phone: string | null; deleted_at: string | null }>(
      test,
      'SELECT phone, deleted_at FROM users WHERE id = ?',
      [test.clientId],
    )[0]!;
    expect(owner.phone).toBeNull();
    expect(owner.deleted_at).not.toBeNull();
    expect(rows(test, 'SELECT id FROM orders WHERE user_id = ?', [test.clientId])).toHaveLength(3);
  });

  it('заказы других клиентов удаление не затрагивает', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const theirs = await placeOk(test, other.cookie, { date: DAY3 });
    await placeOk(test, test.client, { date: DAY3 });
    await call(test, 'POST', '/profile/account/delete', test.client, { confirm: true });
    expect(ordersFor(test.deps).get(theirs.id)?.status).toBe('confirmed');
    expect(billingFor(test.deps).orderCredits(theirs.id).held).toBe(1);
  });

  it('загруженный и невыданный заказ на сегодня не отменяется (бокс уже в холодильнике)', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    ordersFor(test.deps).transition(order.id, 'loaded', { kind: 'operator', userId: test.adminId });
    test.clock.set('2026-03-11T06:00:00Z');
    await call(test, 'POST', '/profile/account/delete', test.client, { confirm: true });
    expect(ordersFor(test.deps).get(order.id)?.status).toBe('loaded');
  });

  it('хук синхронный и идёт в одной транзакции: сбой освобождения откатывает удаление аккаунта', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test, test.client, { date: DAY3 });
    const billing = billingFor(test.deps);
    const original = billing.release;
    billing.release = () => {
      throw new Error('сбой освобождения');
    };
    try {
      const res = await call(test, 'POST', '/profile/account/delete', test.client, {
        confirm: true,
      });
      expect(res.statusCode).toBe(500);
    } finally {
      billing.release = original;
    }
    expect(ordersFor(test.deps).get(order.id)?.status).toBe('confirmed');
    const owner = rows<{ phone: string | null }>(test, 'SELECT phone FROM users WHERE id = ?', [
      test.clientId,
    ])[0]!;
    expect(owner.phone).not.toBeNull();
  });

  it('хук зарегистрирован под именем orders: повторная регистрация отвергается', async () => {
    const test = await makeOrdersApp();
    expect(() => profileFor(test.deps).registerDeletionHook('orders', () => undefined)).toThrow();
    expect(() => profileFor(test.deps).registerExportProvider('orders', () => ({}))).toThrow();
  });
});
