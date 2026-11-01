import { describe, expect, it } from 'vitest';
import { authFor } from '../../src/modules/auth/index.ts';
import { login, setRole, userId } from '../auth/helpers.ts';
import { addFridge } from '../kitchen/helpers.ts';
import {
  call,
  closeIntake,
  dayOf,
  loadedDay,
  makeFulfillmentApp,
  markLoaded,
  OTHER_OPERATOR_PHONE,
  placeOk,
  statusOf,
} from './helpers.ts';

describe('график загрузки оператора (R34, R13.2)', () => {
  it('оператор видит только свои холодильники, администратор — все, клиент и гость — никто', async () => {
    const test = await makeFulfillmentApp();
    const second = await addFridge(test);

    const own = await call(test, 'GET', '/operator/fridges', test.operator);
    expect(own.statusCode).toBe(200);
    expect(own.json().items.map((f: { id: string }) => f.id)).toEqual([test.fridgeId]);
    expect(own.json().items[0]).toMatchObject({ pickupFrom: '07:00', pickupTo: '22:00' });

    const all = await call(test, 'GET', '/operator/fridges', test.admin);
    expect(
      all
        .json()
        .items.map((f: { id: string }) => f.id)
        .sort(),
    ).toEqual([test.fridgeId, second].sort());

    expect((await call(test, 'GET', '/operator/fridges', test.client)).statusCode).toBe(403);
    expect((await call(test, 'GET', '/operator/fridges')).statusCode).toBe(401);

    // чужой холодильник: ни график, ни отметка загрузки
    expect((await dayOf(test, test.operator, second)).statusCode).toBe(403);
    expect((await markLoaded(test, test.operator, second)).statusCode).toBe(403);
  });

  it('график показывает, сколько боксов каких блюд положить на дату, и заказы без кодов клиентов', async () => {
    const test = await makeFulfillmentApp();
    const [a, b] = test.dishes;
    await placeOk(test, test.client, {
      items: [
        { dishId: a, qty: 2 },
        { dishId: b, qty: 1 },
      ],
    });
    const res = await dayOf(test);
    expect(res.statusCode).toBe(200);
    const day = res.json();
    expect(day.loaded).toBe(false);
    expect(day.items.map((i: { dishId: number; qty: number }) => [i.dishId, i.qty])).toEqual([
      [a, 2],
      [b, 1],
    ]);
    expect(day.items[0].name).toEqual({ ru: 'Курица с рисом', ro: 'Pui cu orez' });
    expect(day.totals).toMatchObject({ boxes: 3, waiting: 3, pickedUp: 0 });
    // код получения знает только клиент: у оператора его в ответе нет
    expect(JSON.stringify(day.orders)).not.toMatch(/"code"/);
  });
});

describe('отметка «загружено» (R34, R57)', () => {
  it('пока партии не приготовлены, загрузить нельзя: 409 с названиями блюд, заказы не меняются', async () => {
    const test = await makeFulfillmentApp();
    const [a] = test.dishes;
    const order = await placeOk(test, test.client, { items: [{ dishId: a, qty: 1 }] });
    await closeIntake(test); // партии заведены, но кухня их ещё не приготовила

    const res = await markLoaded(test);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('batches_not_cooked');
    expect(res.json().error.message).toContain('Курица с рисом');
    expect(statusOf(test, order.id)).toBe('confirmed');
    expect((await dayOf(test)).json().blockedDishes).toEqual(['Курица с рисом']);
  });

  it('до закрытия приёма заказов загрузка недоступна: 409 cutoff_not_passed', async () => {
    const test = await makeFulfillmentApp();
    await placeOk(test);
    const res = await markLoaded(test);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('cutoff_not_passed');
  });

  it('после готовых партий заказы холодильника становятся «загружен»; повтор безопасен', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test, { load: false });
    const first = await markLoaded(test);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ loaded: true, orders: 1 });
    expect(statusOf(test, orderId)).toBe('loaded');

    const loadedAt = (await dayOf(test)).json().loadedAt;
    test.clock.advance(60_000);
    const again = await markLoaded(test);
    expect(again.statusCode).toBe(200);
    expect(again.json().loadedAt).toBe(loadedAt);
    expect((await dayOf(test)).json().loaded).toBe(true);
  });

  it('оператор чужого холодильника не может отметить загрузку: 403, заказы не тронуты', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test, { load: false });
    const other = await login(test, OTHER_OPERATOR_PHONE);
    setRole(test.app, OTHER_OPERATOR_PHONE, 'operator');
    authFor(test.app.deps).setOperatorFridges(userId(test.app, OTHER_OPERATOR_PHONE), [
      await addFridge(test),
    ]);
    const res = await markLoaded(test, other);
    expect(res.statusCode).toBe(403);
    expect(statusOf(test, orderId)).toBe('confirmed');
  });
});
