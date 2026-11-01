// Контракты заказов для задач 07–10: статусы, переходы, чтение по холодильнику и дате, поиск по коду.
import { describe, expect, it } from 'vitest';
import {
  canTransition,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OPEN_STATUSES,
} from '@sportpit/shared/schemas/orders';
import { billingFor } from '../../src/modules/billing/index.ts';
import { allocateCode, ordersFor } from '../../src/modules/orders/index.ts';
import { AppError } from '../../src/modules/system/errors.ts';
import { addClient, buyPaid, DAY2, makeOrdersApp, placeOk, rows, TOMORROW } from './helpers.ts';

const OPERATOR = { kind: 'operator', userId: 1 } as const;

function thrown(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Ожидали отказ, но он не случился');
}

describe('перечисление статусов', () => {
  it('пять статусов и допустимые переходы по контракту', () => {
    expect([...ORDER_STATUSES].sort()).toEqual(
      ['cancelled', 'confirmed', 'loaded', 'picked_up', 'written_off'].sort(),
    );
    expect(ORDER_TRANSITIONS.confirmed).toEqual(['loaded', 'written_off', 'cancelled']);
    expect(ORDER_TRANSITIONS.loaded).toEqual(['picked_up', 'written_off']);
    expect(ORDER_TRANSITIONS.picked_up).toEqual([]);
    expect(canTransition('confirmed', 'picked_up')).toBe(false);
    expect(OPEN_STATUSES).toEqual(['confirmed', 'loaded']);
  });
});

describe('orders.transition(orderId, to, actor)', () => {
  it('confirmed → loaded → picked_up; история переходов хранит кто и когда', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const orders = ordersFor(test.deps);
    expect(orders.transition(order.id, 'loaded', OPERATOR).status).toBe('loaded');
    expect(
      orders.transition(order.id, 'picked_up', { kind: 'client', userId: test.clientId }).status,
    ).toBe('picked_up');
    expect(orders.get(order.id)?.status).toBe('picked_up');
    const history = rows<{
      from_status: string;
      to_status: string;
      actor_kind: string;
      at: string;
    }>(
      test,
      'SELECT from_status, to_status, actor_kind, at FROM order_transitions WHERE order_id = ? ORDER BY id',
      [order.id],
    );
    expect(history.map((h) => [h.from_status, h.to_status, h.actor_kind])).toEqual([
      [null, 'confirmed', 'client'],
      ['confirmed', 'loaded', 'operator'],
      ['loaded', 'picked_up', 'client'],
    ]);
    expect(history[1]!.at).toBe('2026-03-10T09:00:00.000Z');
  });

  it('confirmed|loaded → written_off', async () => {
    const test = await makeOrdersApp();
    const a = await placeOk(test);
    const b = await placeOk(test, test.client, { items: [{ dishId: test.dishes[1], qty: 1 }] });
    const orders = ordersFor(test.deps);
    expect(orders.transition(a.id, 'written_off', OPERATOR).status).toBe('written_off');
    orders.transition(b.id, 'loaded', OPERATOR);
    expect(orders.transition(b.id, 'written_off', OPERATOR).status).toBe('written_off');
  });

  it('confirmed → cancelled освобождает резерв кредитов', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const orders = ordersFor(test.deps);
    expect(billingFor(test.deps).orderCredits(order.id).held).toBe(1);
    orders.transition(order.id, 'cancelled', { kind: 'admin', userId: test.adminId });
    expect(billingFor(test.deps).orderCredits(order.id).held).toBe(0);
    expect(billingFor(test.deps).balance(test.clientId)).toBe(12);
  });

  it.each([
    ['confirmed', 'picked_up'],
    ['confirmed', 'confirmed'],
    ['loaded', 'confirmed'],
    ['loaded', 'cancelled'],
    ['picked_up', 'loaded'],
    ['picked_up', 'written_off'],
    ['written_off', 'picked_up'],
    ['cancelled', 'loaded'],
    ['cancelled', 'confirmed'],
  ] as const)('%s → %s отвергается, статус и кредиты не меняются', async (from, to) => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const orders = ordersFor(test.deps);
    // приводим заказ в исходное состояние допустимым путём
    const path: Record<string, Array<'loaded' | 'picked_up' | 'written_off' | 'cancelled'>> = {
      confirmed: [],
      loaded: ['loaded'],
      picked_up: ['loaded', 'picked_up'],
      written_off: ['written_off'],
      cancelled: ['cancelled'],
    };
    for (const step of path[from]!) orders.transition(order.id, step, OPERATOR);
    const heldBefore = billingFor(test.deps).orderCredits(order.id).held;
    const error = thrown(() => orders.transition(order.id, to, OPERATOR));
    expect(error.status).toBe(409);
    expect(error.code).toBe('invalid_transition');
    expect(orders.get(order.id)?.status).toBe(from);
    expect(billingFor(test.deps).orderCredits(order.id).held).toBe(heldBefore);
  });

  it('выдача и списание кредиты не освобождают: ими занимается выдача (consume)', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const orders = ordersFor(test.deps);
    orders.transition(order.id, 'loaded', OPERATOR);
    orders.transition(order.id, 'picked_up', OPERATOR);
    expect(billingFor(test.deps).orderCredits(order.id).held).toBe(1);
  });

  it('неизвестный заказ: 404', async () => {
    const test = await makeOrdersApp();
    const error = thrown(() => ordersFor(test.deps).transition('nope', 'loaded', OPERATOR));
    expect(error.status).toBe(404);
  });
});

describe('чтение для кухни и выдачи', () => {
  it('get(orderId): заказ с позициями; нет такого — undefined', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });
    const record = ordersFor(test.deps).get(order.id)!;
    expect(record).toMatchObject({
      id: order.id,
      userId: test.clientId,
      fridgeId: test.fridgeId,
      date: TOMORROW,
      status: 'confirmed',
      boxes: 2,
      code: order.code,
    });
    expect(record.items).toEqual([
      expect.objectContaining({ dishId: test.dishes[0], qty: 2, calories: 520 }),
    ]);
    expect(ordersFor(test.deps).get('missing')).toBeUndefined();
  });

  it('listByFridgeDate: заказы холодильника на дату с позициями и кодами, без отменённых и чужих дат', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const a = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 2 }] });
    const b = await placeOk(test, other.cookie, { items: [{ dishId: test.dishes[1], qty: 1 }] });
    const gone = await placeOk(test, other.cookie, { items: [{ dishId: test.dishes[2], qty: 1 }] });
    await placeOk(test, test.client, { date: DAY2 });
    const orders = ordersFor(test.deps);
    orders.transition(gone.id, 'cancelled', OPERATOR);

    const list = orders.listByFridgeDate(test.fridgeId, TOMORROW);
    expect(list.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());
    for (const o of list) {
      expect(o.code).toMatch(/^\d{4}$/);
      expect(o.items.length).toBeGreaterThan(0);
    }
    expect(orders.listByFridgeDate('other-fridge', TOMORROW)).toEqual([]);
  });

  it('confirmedItemsByDate: сумма порций по холодильникам и блюдам, только подтверждённые и загруженные', async () => {
    const test = await makeOrdersApp();
    const other = await addClient(test);
    await buyPaid(test, other.cookie, 12);
    const first = await placeOk(test, test.client, {
      items: [
        { dishId: test.dishes[0], qty: 2 },
        { dishId: test.dishes[1], qty: 1 },
      ],
    });
    await placeOk(test, other.cookie, { items: [{ dishId: test.dishes[0], qty: 1 }] });
    const picked = await placeOk(test, other.cookie, {
      items: [{ dishId: test.dishes[2], qty: 1 }],
    });
    const cancelled = await placeOk(test, other.cookie, {
      items: [{ dishId: test.dishes[2], qty: 1 }],
    });
    const orders = ordersFor(test.deps);
    orders.transition(first.id, 'loaded', OPERATOR); // загруженные тоже в сводке
    orders.transition(picked.id, 'loaded', OPERATOR);
    orders.transition(picked.id, 'picked_up', OPERATOR);
    orders.transition(cancelled.id, 'cancelled', OPERATOR);

    const items = orders.confirmedItemsByDate(TOMORROW);
    const sorted = [...items].sort((x, y) => x.dishId - y.dishId);
    expect(sorted).toEqual([
      { fridgeId: test.fridgeId, dishId: test.dishes[0], qty: 3 },
      { fridgeId: test.fridgeId, dishId: test.dishes[1], qty: 1 },
    ]);
    expect(orders.confirmedItemsByDate(DAY2)).toEqual([]);
  });

  it('findByCode: по холодильнику, дате и коду; отменённый, чужая дата и чужой холодильник не находятся', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const orders = ordersFor(test.deps);
    expect(orders.findByCode(test.fridgeId, TOMORROW, order.code!)?.id).toBe(order.id);
    expect(orders.findByCode(test.fridgeId, DAY2, order.code!)).toBeUndefined();
    expect(orders.findByCode('other-fridge', TOMORROW, order.code!)).toBeUndefined();
    orders.transition(order.id, 'cancelled', OPERATOR);
    expect(orders.findByCode(test.fridgeId, TOMORROW, order.code!)).toBeUndefined();
  });

  it('capacityLeft(fridgeId, date): вместимость минус боксы действующих заказов', async () => {
    const test = await makeOrdersApp({ capacity: 10 });
    const orders = ordersFor(test.deps);
    expect(orders.capacityLeft(test.fridgeId, TOMORROW)).toBe(10);
    const order = await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 3 }] });
    expect(orders.capacityLeft(test.fridgeId, TOMORROW)).toBe(7);
    orders.transition(order.id, 'loaded', OPERATOR);
    orders.transition(order.id, 'picked_up', OPERATOR);
    expect(orders.capacityLeft(test.fridgeId, TOMORROW)).toBe(7);
    expect(orders.capacityLeft('other-fridge', TOMORROW)).toBe(0);
  });
});

describe('уникальность кода на холодильник и дату', () => {
  it('при совпадении случайного кода берётся другой', async () => {
    const test = await makeOrdersApp();
    await placeOk(test);
    const taken = rows<{ code: string }>(test, 'SELECT code FROM orders')[0]!.code;
    const script = [Number(taken), Number(taken), (Number(taken) + 1) % 10000];
    const code = allocateCode(test.deps.db, test.fridgeId, TOMORROW, () => script.shift() ?? 4321);
    expect(code).not.toBe(taken);
    expect(code).toBe(String((Number(taken) + 1) % 10000).padStart(4, '0'));
  });

  it('если случайный выбор упорно попадает в занятое, находится первый свободный', async () => {
    const test = await makeOrdersApp();
    await placeOk(test);
    const taken = rows<{ code: string }>(test, 'SELECT code FROM orders')[0]!.code;
    const code = allocateCode(test.deps.db, test.fridgeId, TOMORROW, () => Number(taken));
    expect(code).toMatch(/^\d{4}$/);
    expect(code).not.toBe(taken);
  });

  it('код отменённого заказа освобождается, у другой даты и холодильника тот же код допустим', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const orders = ordersFor(test.deps);
    expect(allocateCode(test.deps.db, test.fridgeId, DAY2, () => Number(order.code))).toBe(
      order.code,
    );
    expect(allocateCode(test.deps.db, 'other', TOMORROW, () => Number(order.code))).toBe(
      order.code,
    );
    orders.transition(order.id, 'cancelled', OPERATOR);
    expect(allocateCode(test.deps.db, test.fridgeId, TOMORROW, () => Number(order.code))).toBe(
      order.code,
    );
  });
});
