import { describe, expect, it } from 'vitest';
import { ordersFor } from '../../src/modules/orders/index.ts';
import { addClient, buyPaid } from '../billing/helpers.ts';
import {
  ENTRY,
  DISH_A,
  SAMPLE,
  SAMPLE_TARGET,
  addEntry,
  call,
  fillProfile,
  makeOrdersApp,
  pickUp,
  placeOk,
} from './helpers.ts';

const ZERO = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 };

describe('трекер дня (R28)', () => {
  it('пока нет ни выданных боксов, ни записей: пустой день с признаком empty', async () => {
    const test = await makeOrdersApp();
    const res = await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      date: '2026-03-11',
      today: '2026-03-10',
      total: ZERO,
      boxes: [],
      entries: [],
      empty: true,
    });
  });

  it('без даты показывает сегодняшний день по Кишинёву; без входа — 401; неверная дата — 400', async () => {
    const test = await makeOrdersApp();
    const res = await call(test, 'GET', '/tracker/day', test.client);
    expect(res.json().date).toBe('2026-03-10');
    expect((await call(test, 'GET', '/tracker/day')).statusCode).toBe(401);
    expect((await call(test, 'GET', '/tracker/day?date=2026-13-40', test.client)).statusCode).toBe(
      400,
    );
  });

  it('выданные боксы вносятся сами: порция × количество, только статус «выдан», только свой заказ и свой день', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    await buyPaid(test, stranger.cookie, 12);

    const delivered = await placeOk(test, test.client, {
      items: [{ dishId: test.dishes[0], qty: 2 }],
    });
    pickUp(test, delivered.id);
    // не выданные: подтверждённый и загруженный; выданный в другой день; чужой заказ
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[1], qty: 1 }] });
    const loaded = await placeOk(test, test.client, {
      date: '2026-03-12',
      items: [{ dishId: test.dishes[2], qty: 1 }],
    });
    ordersFor(test.deps).transition(loaded.id, 'loaded', { kind: 'system' });
    const otherDay = await placeOk(test, test.client, { date: '2026-03-12' });
    pickUp(test, otherDay.id);
    const foreign = await placeOk(test, stranger.cookie);
    pickUp(test, foreign.id);

    const day = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(day.empty).toBe(false);
    expect(day.boxes).toHaveLength(1);
    expect(day.boxes[0]).toMatchObject({
      orderId: delivered.id,
      calories: 2 * DISH_A.calories,
      proteinG: 2 * DISH_A.proteinG,
      fatG: 2 * DISH_A.fatG,
      carbsG: 2 * DISH_A.carbsG,
      fiberG: 2 * DISH_A.fiberG,
    });
    expect(day.boxes[0].items).toEqual([
      { dishId: test.dishes[0], name: expect.objectContaining({ ru: 'Курица с рисом' }), qty: 2 },
    ]);
    expect(day.total).toEqual({ calories: 1040, proteinG: 84, fatG: 28, carbsG: 110, fiberG: 12 });
    expect(day.entries).toEqual([]);
  });

  it('итог дня = выданные боксы + ручные записи', async () => {
    const test = await makeOrdersApp();
    const order = await placeOk(test);
    pickUp(test, order.id);
    await addEntry(test);
    const day = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(day.total).toEqual({
      calories: DISH_A.calories + ENTRY.calories,
      proteinG: DISH_A.proteinG + ENTRY.proteinG,
      fatG: DISH_A.fatG + ENTRY.fatG,
      carbsG: DISH_A.carbsG + ENTRY.carbsG,
      fiberG: DISH_A.fiberG + ENTRY.fiberG,
    });
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]).toMatchObject({ name: ENTRY.name, calories: ENTRY.calories });
  });

  it('одна ручная запись без боксов: день уже не пустой', async () => {
    const test = await makeOrdersApp();
    await addEntry(test);
    const day = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(day.empty).toBe(false);
    expect(day.total.calories).toBe(ENTRY.calories);
  });
});

describe('ручные записи: проверка, правка, удаление (R28.1)', () => {
  it('отрицательные числа, нечисла, пустое название и неверная дата отклоняются, ничего не пишется', async () => {
    const test = await makeOrdersApp();
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ calories: -1 }, 'calories'],
      [{ proteinG: -0.5 }, 'proteinG'],
      [{ fatG: -3 }, 'fatG'],
      [{ carbsG: -10 }, 'carbsG'],
      [{ fiberG: -1 }, 'fiberG'],
      [{ calories: '150' }, 'calories'],
      [{ calories: null }, 'calories'],
      [{ calories: 1_000_000 }, 'calories'],
      [{ name: '   ' }, 'name'],
      [{ name: 'x'.repeat(101) }, 'name'],
      [{ date: '11.03.2026' }, 'date'],
    ];
    for (const [override, field] of bad) {
      const res = await call(test, 'POST', '/tracker/entries', test.client, {
        ...ENTRY,
        ...override,
      });
      expect(res.statusCode, JSON.stringify(override)).toBe(400);
      expect(res.json().error.fields[field], JSON.stringify(override)).toMatch(/^tracker\.error\./);
    }
    expect(test.deps.db.query('SELECT id FROM tracker_entries')).toEqual([]);
  });

  it('ноль допустим; белки, жиры, углеводы и клетчатка по умолчанию 0', async () => {
    const test = await makeOrdersApp();
    const res = await call(test, 'POST', '/tracker/entries', test.client, {
      date: '2026-03-11',
      name: 'Вода с лимоном',
      calories: 0,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().entry).toMatchObject({
      calories: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      fiberG: 0,
    });
  });

  it('правка меняет только присланные поля; отрицательное при правке отклоняется', async () => {
    const test = await makeOrdersApp();
    const entry = await addEntry(test);
    const patched = await call(test, 'PATCH', `/tracker/entries/${entry.id}`, test.client, {
      calories: 200,
      name: 'Йогурт с мёдом',
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().entry).toMatchObject({
      id: entry.id,
      name: 'Йогурт с мёдом',
      calories: 200,
      proteinG: ENTRY.proteinG,
    });
    const negative = await call(test, 'PATCH', `/tracker/entries/${entry.id}`, test.client, {
      proteinG: -5,
    });
    expect(negative.statusCode).toBe(400);
    const empty = await call(test, 'PATCH', `/tracker/entries/${entry.id}`, test.client, {});
    expect(empty.statusCode).toBe(400);
    const day = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(day.entries[0]).toMatchObject({ calories: 200, proteinG: ENTRY.proteinG });
  });

  it('удаление убирает запись из итога; чужую запись нельзя ни править, ни удалить (404)', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    const entry = await addEntry(test);
    expect(
      (await call(test, 'PATCH', `/tracker/entries/${entry.id}`, stranger.cookie, { calories: 1 }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(test, 'DELETE', `/tracker/entries/${entry.id}`, stranger.cookie)).statusCode,
    ).toBe(404);
    expect(
      (await call(test, 'DELETE', `/tracker/entries/${entry.id}`, test.client)).statusCode,
    ).toBe(200);
    const day = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(day).toMatchObject({ entries: [], total: ZERO, empty: true });
    expect(
      (await call(test, 'DELETE', `/tracker/entries/${entry.id}`, test.client)).statusCode,
    ).toBe(404);
  });
});

describe('цель из анкеты и неделя (R04)', () => {
  it('в дне цель — норма из анкеты; без анкеты цели нет; при «обратитесь к врачу» цели нет и есть признак', async () => {
    const test = await makeOrdersApp();
    const none = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(none).toMatchObject({ target: null, targetBlocked: false });

    await fillProfile(test);
    const withProfile = (
      await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)
    ).json();
    expect(withProfile.target).toEqual(SAMPLE_TARGET);
    expect(withProfile.targetBlocked).toBe(false);

    await call(test, 'PUT', '/profile', test.client, { ...SAMPLE, hasCondition: true });
    const blocked = (await call(test, 'GET', '/tracker/day?date=2026-03-11', test.client)).json();
    expect(blocked).toMatchObject({ target: null, targetBlocked: true });
  });

  it('неделя с понедельника по воскресенье: суммы по дням, число боксов и записей, цель', async () => {
    const test = await makeOrdersApp();
    await fillProfile(test);
    const order = await placeOk(test); // среда 11 марта
    pickUp(test, order.id);
    await addEntry(test, test.client, { date: '2026-03-11' });
    await addEntry(test, test.client, { date: '2026-03-09', name: 'Банан', calories: 90 });
    await addEntry(test, test.client, {
      date: '2026-03-16',
      name: 'Следующая неделя',
      calories: 777,
    });

    const res = await call(test, 'GET', '/tracker/week?date=2026-03-11', test.client);
    expect(res.statusCode).toBe(200);
    const week = res.json();
    expect(week).toMatchObject({
      from: '2026-03-09',
      to: '2026-03-15',
      today: '2026-03-10',
      target: SAMPLE_TARGET,
      targetBlocked: false,
      empty: false,
    });
    expect(week.days.map((d: { date: string }) => d.date)).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
    expect(week.days[0]).toMatchObject({ boxes: 0, entries: 1, total: { calories: 90 } });
    expect(week.days[1]).toMatchObject({ boxes: 0, entries: 0, total: ZERO });
    expect(week.days[2]).toMatchObject({
      boxes: 1,
      entries: 1,
      total: { calories: DISH_A.calories + ENTRY.calories },
    });
    expect(JSON.stringify(week)).not.toContain('777');
  });

  it('неделя без данных пуста (empty), воскресенье относится к своей неделе, без даты — текущая неделя', async () => {
    const test = await makeOrdersApp();
    const sunday = (await call(test, 'GET', '/tracker/week?date=2026-03-15', test.client)).json();
    expect(sunday).toMatchObject({
      from: '2026-03-09',
      to: '2026-03-15',
      empty: true,
      target: null,
    });
    const current = (await call(test, 'GET', '/tracker/week', test.client)).json();
    expect(current.from).toBe('2026-03-09');
    expect((await call(test, 'GET', '/tracker/week')).statusCode).toBe(401);
  });
});

describe('данные клиента (R29, R29.1): провайдер и хук tracker', () => {
  it('выгрузка отдаёт ручные записи только текущего клиента', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    await addEntry(test, test.client, { name: 'Мой йогурт' });
    await addEntry(test, stranger.cookie, { name: 'Чужой салат' });
    const res = await call(test, 'GET', '/profile/export', test.client);
    const tracker = res.json().data.tracker;
    expect(tracker.entries).toHaveLength(1);
    expect(tracker.entries[0]).toMatchObject({ name: 'Мой йогурт', calories: ENTRY.calories });
    expect(res.body).not.toContain('Чужой салат');
  });

  it('удаление аккаунта стирает ручные записи клиента и не трогает чужие', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    await addEntry(test, test.client);
    await addEntry(test, stranger.cookie, { name: 'Чужой салат' });
    const res = await call(test, 'POST', '/profile/account/delete', test.client, { confirm: true });
    expect(res.statusCode).toBe(200);
    expect(
      test.deps.db
        .query('SELECT name FROM tracker_entries')
        .map((r) => (r as { name: string }).name),
    ).toEqual(['Чужой салат']);
  });
});
