import { describe, expect, it } from 'vitest';
import { rate } from '../feedback/helpers.ts';
import { makeReportsDay, rateDelivered, report } from './helpers.ts';

describe('отчёт «Выдано и списано» (R08, R37)', () => {
  it('приготовлено, выдано, списано и процент списаний по блюдам, холодильникам и причинам', async () => {
    const day = await makeReportsDay();
    const [a, b, c] = day.dishes;
    const body = (await report(day, 'waste')).json();

    // разобрано вручную: заказано и приготовлено 7 боксов, выдано 6 минус невыданный C плюс лишний B в браке
    // A: 3 готовили, 3 выдали; B: 3 готовили, 3 выдали, 1 лишний бокс списан (брак); C: 1 готовили, не забрали
    expect(body.totals).toEqual({ cooked: 7, delivered: 6, writtenOff: 2, wastePercent: 28.6 });
    const row = (id: number) => body.rows.find((r: { dishId: number }) => r.dishId === id);
    expect(row(a)).toMatchObject({ cooked: 3, delivered: 3, writtenOff: 0, wastePercent: 0 });
    expect(row(b)).toMatchObject({ cooked: 3, delivered: 3, writtenOff: 1, wastePercent: 33.3 });
    expect(row(c)).toMatchObject({ cooked: 1, delivered: 0, writtenOff: 1, wastePercent: 100 });
    expect(row(a).name).toEqual({ ru: 'Курица с рисом', ro: 'Pui cu orez' });
    // сначала больше всего списанного
    expect(body.rows.map((r: { dishId: number }) => r.dishId)).toEqual([b, c, a]);

    expect(body.byFridge).toEqual([
      {
        fridgeId: day.fridge2Id,
        fridgeName: 'Холодильник у стойки',
        gymName: 'Зал «Север»',
        cooked: 2,
        delivered: 2,
        writtenOff: 0,
        wastePercent: 0,
      },
      {
        fridgeId: day.fridgeId,
        fridgeName: 'Холодильник у входа',
        gymName: 'Зал «Тест»',
        cooked: 5,
        delivered: 4,
        writtenOff: 2,
        wastePercent: 40,
      },
    ]);
    expect(body.byReason).toEqual([
      { reason: 'defect', qty: 1 },
      { reason: 'not_picked_up', qty: 1 },
    ]);
    expect(body.daily).toHaveLength(31);
    expect(body.daily.filter((d: { delivered: number }) => d.delivered > 0)).toEqual([
      { date: '2026-03-11', delivered: 6, writtenOff: 2 },
    ]);
  });

  it('запас на брак входит в приготовленное и показан отдельной строкой «без холодильника»', async () => {
    const day = await makeReportsDay({ bufferPercent: 50 });
    const body = (await report(day, 'waste')).json();
    // запас: A 3→2, B 3→2, C 1→1 (округление вверх) = 5; приготовлено 7 + 5
    expect(body.totals).toMatchObject({
      cooked: 12,
      delivered: 6,
      writtenOff: 2,
      wastePercent: 16.7,
    });
    const reserve = body.byFridge.find((f: { fridgeId: string | null }) => f.fridgeId === null);
    expect(reserve).toMatchObject({ cooked: 5, delivered: 0, writtenOff: 0, fridgeName: null });
    expect(body.byFridge.at(-1).fridgeId).toBeNull();
  });

  it('за период без выдачи приготовленного нет и процент списаний не считается', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'waste', 'from=2026-03-12&to=2026-03-20')).json();
    expect(body.totals).toEqual({ cooked: 0, delivered: 0, writtenOff: 0, wastePercent: null });
    expect(body.rows).toEqual([]);
    expect(body.byReason).toEqual([]);
  });
});

describe('отчёт «Рейтинг блюд» (R26, R37)', () => {
  it('средняя оценка и число оценок за период; рядом рейтинг за всё время из каталога', async () => {
    const day = await makeReportsDay();
    await rateDelivered(day);
    const [a, b] = day.dishes;
    const body = (await report(day, 'ratings')).json();

    // A: 5 и 3 → 4,00 (2 оценки); B: 4 (1 оценка); при равной средней выше блюдо с большим числом оценок
    expect(body.rows).toEqual([
      {
        dishId: a,
        name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
        count: 2,
        avg: 4,
        allTimeAvg: 4,
        allTimeCount: 2,
      },
      {
        dishId: b,
        name: { ru: 'Лосось с овощами', ro: 'Somon cu legume' },
        count: 1,
        avg: 4,
        allTimeAvg: 4,
        allTimeCount: 1,
      },
    ]);
    expect(body.totals).toEqual({ ratings: 3, avg: 4 });
  });

  it('оценка вне периода не входит, а за всё время остаётся в рейтинге блюда', async () => {
    const day = await makeReportsDay();
    await rateDelivered(day);
    const before = (await report(day, 'ratings', 'from=2026-03-01&to=2026-03-10')).json();
    expect(before.rows).toEqual([]);
    expect(before.totals).toEqual({ ratings: 0, avg: null });
    const sameDay = (await report(day, 'ratings', 'from=2026-03-11&to=2026-03-11')).json();
    expect(sameDay.totals.ratings).toBe(3);
  });

  it('правка оценки в течение суток учитывается: в отчёте стоит последняя оценка', async () => {
    const day = await makeReportsDay();
    const [a] = day.dishes;
    const send = (cookie: string, orderId: string, stars: number) =>
      rate(day, cookie, { orderId, dishId: a, stars });
    expect((await send(day.cookies.first, day.orders.first.id, 5)).statusCode).toBe(200);
    expect((await send(day.cookies.second, day.orders.second.id, 4)).statusCode).toBe(200);
    expect((await report(day, 'ratings')).json().rows[0]).toMatchObject({ count: 2, avg: 4.5 });
    expect((await send(day.cookies.first, day.orders.first.id, 2)).statusCode).toBe(200);
    expect((await report(day, 'ratings')).json().rows[0]).toMatchObject({ count: 2, avg: 3 });
  });
});
