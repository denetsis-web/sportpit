import { describe, expect, it } from 'vitest';
import { catalogFor } from '../../src/modules/catalog/index.ts';
import { addClient } from '../billing/helpers.ts';
import { HOUR, call, makeOrdersApp, pickedUpOrder, placeOk, rate } from './helpers.ts';

describe('оценка блюда (R26)', () => {
  it('оценить можно только блюдо из выданного заказа: подтверждённый заказ — 409, ничего не пишется', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    const res = await rate(test, test.client, {
      orderId: order.id,
      dishId: test.dishes[0],
      stars: 5,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('order_not_picked_up');
    expect(catalogFor(test.deps).getDishRating(test.dishes[0])).toEqual({ avg: null, count: 0 });
  });

  it('чужой и неизвестный заказ — 404, блюдо не из этого заказа — 404, без входа — 401', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const stranger = await addClient(test);
    const foreign = await rate(test, stranger.cookie, {
      orderId: order.id,
      dishId: test.dishes[0],
      stars: 4,
    });
    expect(foreign.statusCode).toBe(404);
    const unknown = await rate(test, test.client, {
      orderId: 'no-such-order',
      dishId: test.dishes[0],
      stars: 4,
    });
    expect(unknown.statusCode).toBe(404);
    const otherDish = await rate(test, test.client, {
      orderId: order.id,
      dishId: test.dishes[1],
      stars: 4,
    });
    expect(otherDish.statusCode).toBe(404);
    const anon = await call(test, 'PUT', '/feedback/ratings', undefined, {
      orderId: order.id,
      dishId: test.dishes[0],
      stars: 4,
    });
    expect(anon.statusCode).toBe(401);
  });

  it('звёзды только целые 1–5, тег только из списка (вкус, свежесть, порция, КБЖУ)', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const base = { orderId: order.id, dishId: test.dishes[0] };
    for (const stars of [0, 6, 3.5, -1]) {
      const res = await rate(test, test.client, { ...base, stars });
      expect(res.statusCode, `stars=${stars}`).toBe(400);
      expect(res.json().error.fields.stars).toBeDefined();
    }
    const badTag = await rate(test, test.client, { ...base, stars: 4, tag: 'price' });
    expect(badTag.statusCode).toBe(400);
    for (const tag of ['taste', 'freshness', 'portion', 'kbzhu']) {
      expect((await rate(test, test.client, { ...base, stars: 4, tag })).statusCode, tag).toBe(200);
    }
  });

  it('оценка попадает в рейтинг блюда, который читает меню', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const res = await rate(test, test.client, {
      orderId: order.id,
      dishId: test.dishes[0],
      stars: 5,
      tag: 'taste',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rating).toMatchObject({
      dishId: test.dishes[0],
      stars: 5,
      tag: 'taste',
      canEdit: true,
    });
    expect(catalogFor(test.deps).getDishRating(test.dishes[0])).toEqual({ avg: 5, count: 1 });
    const menu = (await call(test, 'GET', '/menu?date=2026-03-11')).json();
    const item = menu.items.find((i: { id: number }) => i.id === test.dishes[0]);
    expect(item.rating).toEqual({ avg: 5, count: 1 });
  });

  it('один отзыв на блюдо в заказе: правка в течение 24 часов заменяет оценку, голос не добавляется', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const body = { orderId: order.id, dishId: test.dishes[0] };
    await rate(test, test.client, { ...body, stars: 5, tag: 'taste' });
    test.clock.advance(23 * HOUR);
    const edited = await rate(test, test.client, { ...body, stars: 2, tag: 'freshness' });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().rating).toMatchObject({ stars: 2, tag: 'freshness' });
    expect(catalogFor(test.deps).getDishRating(test.dishes[0])).toEqual({ avg: 2, count: 1 });
    const stored = test.deps.db.query('SELECT * FROM dish_ratings WHERE order_id = ?', [order.id]);
    expect(stored).toHaveLength(1);
  });

  it('через 24 часа после первой оценки правка закрыта: 409, рейтинг прежний', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const body = { orderId: order.id, dishId: test.dishes[0] };
    await rate(test, test.client, { ...body, stars: 5 });
    test.clock.advance(24 * HOUR + 60 * 1000);
    const late = await rate(test, test.client, { ...body, stars: 1 });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('rating_locked');
    expect(catalogFor(test.deps).getDishRating(test.dishes[0])).toEqual({ avg: 5, count: 1 });
  });

  it('то же блюдо в другом заказе оценивается отдельно', async () => {
    const test = await makeOrdersApp();
    const first = await pickedUpOrder(test);
    const second = await pickedUpOrder(test, test.client, { date: '2026-03-12' });
    await rate(test, test.client, { orderId: first.id, dishId: test.dishes[0], stars: 5 });
    await rate(test, test.client, { orderId: second.id, dishId: test.dishes[0], stars: 3 });
    expect(catalogFor(test.deps).getDishRating(test.dishes[0])).toEqual({ avg: 4, count: 2 });
  });

  it('в карточке блюда отзывы показаны со звёздами, тегом и датой — без телефона автора', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    await rate(test, test.client, {
      orderId: order.id,
      dishId: test.dishes[0],
      stars: 4,
      tag: 'portion',
    });
    const phone = test.deps.db.get<{ phone: string }>('SELECT phone FROM users WHERE id = ?', [
      test.clientId,
    ])!.phone;
    const res = await call(test, 'GET', `/dishes/${test.dishes[0]}`);
    const card = res.json();
    expect(card.reviews).toEqual([
      { stars: 4, tag: 'portion', createdAt: test.clock.now().toISOString() },
    ]);
    expect(res.body).not.toContain(phone.replace('+', ''));
  });

  it('список «что оценить»: выданные заказы клиента с блюдами и его оценками, чужие и невыданные не видны', async () => {
    const test = await makeOrdersApp();
    const done = await pickedUpOrder(test);
    const waiting = await placeOk(test, test.client, { date: '2026-03-12' });
    await rate(test, test.client, { orderId: done.id, dishId: test.dishes[0], stars: 5 });
    const stranger = await addClient(test);
    const res = await call(test, 'GET', '/feedback/orders', test.client);
    expect(res.statusCode).toBe(200);
    const { items } = res.json();
    expect(items.map((i: { orderId: string }) => i.orderId)).toEqual([done.id]);
    expect(items[0].dishes[0]).toMatchObject({ dishId: test.dishes[0] });
    expect(items[0].dishes[0].rating).toMatchObject({ stars: 5 });
    expect(items.some((i: { orderId: string }) => i.orderId === waiting.id)).toBe(false);
    const empty = await call(test, 'GET', '/feedback/orders', stranger.cookie);
    expect(empty.json().items).toEqual([]);
  });
});

describe('feedback.pendingRatings: что ещё не оценено (для «Как блюдо?»)', () => {
  it('отдаёт выданные заказы только с неоценёнными блюдами; оценённые и невыданные не попадают', async () => {
    const { feedbackFor } = await import('../../src/modules/feedback/index.ts');
    const test = await makeOrdersApp();
    const both = await pickedUpOrder(test, test.client, {
      items: [
        { dishId: test.dishes[0], qty: 1 },
        { dishId: test.dishes[1], qty: 1 },
      ],
    });
    const done = await pickedUpOrder(test, test.client, { date: '2026-03-12' });
    await placeOk(test, test.client, { date: '2026-03-13' });
    await rate(test, test.client, { orderId: both.id, dishId: test.dishes[0], stars: 5 });
    await rate(test, test.client, { orderId: done.id, dishId: test.dishes[0], stars: 4 });

    const feedback = feedbackFor(test.deps);
    const pending = feedback.pendingRatings(test.clientId);
    expect(pending.map((o) => o.orderId)).toEqual([both.id]);
    expect(pending[0]!.dishes.map((d) => d.dishId)).toEqual([test.dishes[1]]);
    expect(feedback.pendingRatings(test.clientId + 999)).toEqual([]);
  });
});
