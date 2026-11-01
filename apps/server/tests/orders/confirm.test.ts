import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import { journalSum, ledgerRows } from '../billing/helpers.ts';
import {
  addClient,
  balanceOf,
  buyPaid,
  call,
  makeOrdersApp,
  newKey,
  orderBody,
  orderCount,
  placeOk,
  placeOrder,
  portionsLeft,
  rows,
  TOMORROW,
  DAY2,
} from './helpers.ts';

describe('подтверждение заказа (R10, R23, R23.1)', () => {
  it('подтверждает заказ: код из 4 цифр, позиции с КБЖУ, резерв кредитов по журналу', async () => {
    const test = await makeOrdersApp();
    const res = await placeOrder(test, test.client, {
      items: [
        { dishId: test.dishes[0], qty: 2 },
        { dishId: test.dishes[1], qty: 1 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const { order, firstOrder } = res.json();
    expect(firstOrder).toBe(true);
    expect(order).toMatchObject({
      status: 'confirmed',
      date: TOMORROW,
      fridgeId: test.fridgeId,
      boxes: 3,
      canChange: true,
      pickupFrom: '07:00',
      pickupTo: '22:00',
    });
    expect(order.code).toMatch(/^\d{4}$/);
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({
      dishId: test.dishes[0],
      qty: 2,
      name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
      calories: 520,
      proteinG: 42,
    });
    // срок отмены: 18:00 накануне по Кишинёву (10 марта, зима, +2 часа) = 16:00 UTC
    expect(order.cutoffAt).toBe('2026-03-10T16:00:00.000Z');

    // кредиты зарезервированы записями журнала с идентификатором заказа
    expect(await balanceOf(test)).toBe(9);
    const reserved = ledgerRows(test, test.clientId).filter(
      (r) => r.reason === 'reserve' && r.order_id === order.id,
    );
    expect(reserved.reduce((sum, r) => sum + r.delta, 0)).toBe(-3);
    expect(journalSum(test, test.clientId)).toBe(9);
  });

  it('порции блюд занимаются заказом и видны в меню', async () => {
    const test = await makeOrdersApp({ portions: 5 });
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });
    expect(await portionsLeft(test, TOMORROW, test.dishes[0])).toBe(3);
    expect(await portionsLeft(test, TOMORROW, test.dishes[1])).toBe(5);
    // другой день не затронут
    expect(await portionsLeft(test, DAY2, test.dishes[0])).toBe(5);
  });

  it('вход обязателен: без сессии 401, заказ не создаётся', async () => {
    const test = await makeOrdersApp();
    const res = await call(test, 'POST', '/orders', undefined, orderBody(test));
    expect(res.statusCode).toBe(401);
    expect(orderCount(test)).toBe(0);
  });

  it('не хватает порции блюда: заказ не создаётся целиком, названо блюдо, кредиты и остатки не тронуты', async () => {
    const test = await makeOrdersApp({ portions: 30 });
    // у блюда B на завтра остаётся одна порция: лимит 4, другой клиент уже занял 3
    const taker = await addClient(test);
    await buyPaid(test, taker.cookie, 12);
    await placeOk(test, taker.cookie, { items: [{ dishId: test.dishes[1], qty: 3 }] });
    const resized = await call(test, 'PUT', `/admin/menu/${TOMORROW}`, test.admin, {
      items: [
        { dishId: test.dishes[0], portionLimit: 30 },
        { dishId: test.dishes[1], portionLimit: 4 },
        { dishId: test.dishes[2], portionLimit: 30 },
      ],
    });
    expect(resized.statusCode).toBe(200);

    const res = await placeOrder(
      test,
      test.client,
      {
        items: [
          { dishId: test.dishes[0], qty: 1 },
          { dishId: test.dishes[1], qty: 2 },
        ],
      },
      { 'accept-language': 'ru' },
    );
    expect(res.statusCode).toBe(409);
    const body = res.json().error;
    expect(body.code).toBe('dish_sold_out');
    expect(body.message).toContain('Лосось с овощами');
    expect(orderCount(test)).toBe(1); // только заказ taker
    expect(await balanceOf(test)).toBe(12);
    expect(await portionsLeft(test, TOMORROW, test.dishes[0])).toBe(30);
    expect(await portionsLeft(test, TOMORROW, test.dishes[1])).toBe(1);
  });

  it('название блюда в отказе — на языке запроса (румынский)', async () => {
    const test = await makeOrdersApp({ portions: 1 });
    const res = await placeOrder(
      test,
      test.client,
      { items: [{ dishId: test.dishes[2], qty: 2 }] },
      { 'accept-language': 'ro' },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain('Terci cu fructe');
    expect(res.json().error.message).not.toContain('Овсянка');
  });

  it('блюдо вне меню этого дня или отключённое: отказ, заказ не создаётся', async () => {
    const test = await makeOrdersApp({ menuDates: [TOMORROW] });
    const outside = await placeOrder(test, test.client, { date: DAY2 });
    expect(outside.statusCode).toBe(409);
    expect(outside.json().error.code).toBe('dish_unavailable');

    const unknown = await placeOrder(test, test.client, { items: [{ dishId: 99999, qty: 1 }] });
    expect(unknown.statusCode).toBe(409);
    expect(unknown.json().error.code).toBe('dish_unavailable');

    await call(test, 'PATCH', `/admin/dishes/${test.dishes[0]}`, test.admin, { active: false });
    const disabled = await placeOrder(test);
    expect(disabled.statusCode).toBe(409);
    expect(disabled.json().error.code).toBe('dish_unavailable');
    expect(orderCount(test)).toBe(0);
  });

  it('неизвестный или выключенный холодильник: отказ', async () => {
    const test = await makeOrdersApp();
    const missing = await placeOrder(test, test.client, { fridgeId: 'no-such-fridge' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('fridge_unavailable');
    await call(test, 'PATCH', `/admin/fridges/${test.fridgeId}`, test.admin, { active: false });
    const off = await placeOrder(test);
    expect(off.statusCode).toBe(404);
    expect(orderCount(test)).toBe(0);
  });

  it('тело проверяется: пустой заказ, количество, ключ, дата', async () => {
    const test = await makeOrdersApp();
    for (const bad of [
      { items: [] },
      { items: [{ dishId: test.dishes[0], qty: 0 }] },
      { items: [{ dishId: test.dishes[0], qty: 11 }] },
      { idempotencyKey: 'x' },
      { date: '2026-13-40' },
    ]) {
      const res = await placeOrder(test, test.client, bad);
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
      expect(res.json().error.code).toBe('validation_failed');
    }
    expect(orderCount(test)).toBe(0);
  });

  it('одно блюдо двумя строками складывается в одну позицию', async () => {
    const test = await makeOrdersApp();
    const res = await placeOrder(test, test.client, {
      items: [
        { dishId: test.dishes[0], qty: 1 },
        { dishId: test.dishes[0], qty: 1 },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().order.items).toHaveLength(1);
    expect(res.json().order.boxes).toBe(2);
  });
});

describe('вместимость холодильника и лимит боксов в день (R43, R46, R59)', () => {
  it('сверх вместимости заказ не принимается: «Мест нет», свободные места видны в availability', async () => {
    const test = await makeOrdersApp({ capacity: 3 });
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });

    const res = await placeOrder(test, other.cookie, {
      items: [{ dishId: test.dishes[1], qty: 2 }],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('fridge_full');
    expect(res.json().error.message).toContain('Мест нет');
    expect(await balanceOf(test, other.cookie)).toBe(12);

    const info = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${TOMORROW}`,
      other.cookie,
    );
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({
      capacityBoxes: 3,
      boxesLeft: 1,
      closedReason: null,
      userBoxes: 0,
    });

    // в последнее место помещается
    const last = await placeOrder(test, other.cookie, {
      items: [{ dishId: test.dishes[1], qty: 1 }],
    });
    expect(last.statusCode).toBe(201);
    const full = await call(
      test,
      'GET',
      `/orders/availability?fridgeId=${test.fridgeId}&date=${TOMORROW}`,
      other.cookie,
    );
    expect(full.json().boxesLeft).toBe(0);
  });

  it('вместимость считается отдельно по холодильникам и по датам', async () => {
    const test = await makeOrdersApp({ capacity: 2 });
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });
    const nextDay = await placeOrder(test, test.client, { date: DAY2 });
    expect(nextDay.statusCode).toBe(201);
  });

  it('больше боксов в день на клиента, чем разрешено (по умолчанию 3), не принимается — и суммой нескольких заказов', async () => {
    const test = await makeOrdersApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });
    const over = await placeOrder(test, test.client, {
      items: [{ dishId: test.dishes[1], qty: 2 }],
    });
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('box_limit');
    expect(over.json().error.message).toContain('3');
    const ok = await placeOrder(test, test.client, { items: [{ dishId: test.dishes[1], qty: 1 }] });
    expect(ok.statusCode).toBe(201);
    // следующий день — свой лимит
    const nextDay = await placeOrder(test, test.client, { date: DAY2 });
    expect(nextDay.statusCode).toBe(201);
  });

  it('лимит берётся из настройки: администратор поставил 1', async () => {
    const test = await makeOrdersApp();
    adminFor(test.deps).setSetting('maxBoxesPerDay', 1, test.adminId);
    const res = await placeOrder(test, test.client, {
      items: [{ dishId: test.dishes[0], qty: 2 }],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('box_limit');
    expect((await placeOrder(test)).statusCode).toBe(201);
  });

  it('отменённый заказ не занимает ни места, ни лимит', async () => {
    const test = await makeOrdersApp({ capacity: 3 });
    const first = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 3 }] });
    await call(test, 'POST', `/orders/${first.id}/cancel`, test.client);
    const again = await placeOrder(test, test.client, {
      items: [{ dishId: test.dishes[0], qty: 3 }],
    });
    expect(again.statusCode).toBe(201);
  });
});

describe('баланс кредитов', () => {
  it('не хватает кредитов: 409 insufficient_credits, заказ не создаётся', async () => {
    const test = await makeOrdersApp({ credits: 1 });
    const res = await placeOrder(test, test.client, {
      items: [{ dishId: test.dishes[0], qty: 2 }],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('insufficient_credits');
    expect(orderCount(test)).toBe(0);
    expect(await balanceOf(test)).toBe(1);
  });

  it('без пакета (баланс 0) заказать нельзя', async () => {
    const test = await makeOrdersApp({ credits: 0 });
    const res = await placeOrder(test);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('insufficient_credits');
  });
});

describe('идемпотентность подтверждения (R10.1)', () => {
  it('повтор с тем же ключом возвращает тот же заказ и не списывает кредиты дважды', async () => {
    const test = await makeOrdersApp();
    const key = newKey();
    const first = await placeOrder(test, test.client, { idempotencyKey: key });
    const second = await placeOrder(test, test.client, { idempotencyKey: key });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().order.id).toBe(first.json().order.id);
    expect(second.json().order.code).toBe(first.json().order.code);
    expect(orderCount(test)).toBe(1);
    expect(await balanceOf(test)).toBe(11);
  });

  it('два одновременных запроса с одним ключом дают один заказ', async () => {
    const test = await makeOrdersApp();
    const key = newKey();
    const [a, b] = await Promise.all([
      placeOrder(test, test.client, { idempotencyKey: key }),
      placeOrder(test, test.client, { idempotencyKey: key }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().order.id).toBe(b.json().order.id);
    expect(orderCount(test)).toBe(1);
    expect(await balanceOf(test)).toBe(11);
  });

  it('тот же ключ у другого клиента — другой заказ', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const key = newKey();
    const a = await placeOrder(test, test.client, { idempotencyKey: key });
    const b = await placeOrder(test, other.cookie, { idempotencyKey: key });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().order.id).not.toBe(b.json().order.id);
  });

  it('повтор после отмены не воскрешает заказ', async () => {
    const test = await makeOrdersApp();
    const key = newKey();
    const first = await placeOrder(test, test.client, { idempotencyKey: key });
    await call(test, 'POST', `/orders/${first.json().order.id}/cancel`, test.client);
    const again = await placeOrder(test, test.client, { idempotencyKey: key });
    expect(again.statusCode).toBe(200);
    expect(again.json().order.status).toBe('cancelled');
    expect(await balanceOf(test)).toBe(12);
  });
});

describe('код получения (R11)', () => {
  it('у каждого подтверждённого заказа свой код из 4 цифр, в базе — уникальный на холодильник и дату', async () => {
    const test = await makeOrdersApp();
    adminFor(test.deps).setSetting('maxBoxesPerDay', 50, test.adminId);
    await buyPaid(test, test.client, 30);
    const codes = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const order = await placeOk(test, test.client);
      expect(order.code).toMatch(/^\d{4}$/);
      codes.add(order.code!);
    }
    expect(codes.size).toBe(25);
    expect(() =>
      test.deps.db.run(
        `INSERT INTO orders (id, user_id, fridge_id, date, status, code, boxes, idempotency_key, created_at, updated_at)
         SELECT 'dup', user_id, fridge_id, date, 'confirmed', code, 1, 'dup-key', created_at, updated_at FROM orders LIMIT 1`,
      ),
    ).toThrow();
    expect(rows(test, 'SELECT id FROM orders')).toHaveLength(25);
  });
});

describe('чтение заказов', () => {
  it('список «Мои заказы»: предстоящие и прошлые, свои и только свои', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const mine = await placeOk(test);
    await placeOk(test, other.cookie);

    const list = await call(test, 'GET', '/orders', test.client);
    expect(list.statusCode).toBe(200);
    expect(list.json().upcoming.map((o: { id: string }) => o.id)).toEqual([mine.id]);
    expect(list.json().past).toEqual([]);

    // прошёл день выдачи: заказ уходит в «прошлые»
    test.clock.set('2026-03-12T10:00:00Z');
    const later = await call(test, 'GET', '/orders', test.client);
    expect(later.json().upcoming).toEqual([]);
    expect(later.json().past.map((o: { id: string }) => o.id)).toEqual([mine.id]);
    expect(later.json().past[0].code).toMatch(/^\d{4}$/);

    const one = await call(test, 'GET', `/orders/${mine.id}`, test.client);
    expect(one.statusCode).toBe(200);
    const foreign = await call(test, 'GET', `/orders/${mine.id}`, other.cookie);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe('order_not_found');
  });
});
