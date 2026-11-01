import { describe, expect, it } from 'vitest';
import { authFor } from '../../src/modules/auth/index.ts';
import { login, setRole, userId } from '../auth/helpers.ts';
import { addFridge } from '../kitchen/helpers.ts';
import { call, dayOf, makeFulfillmentApp, OTHER_OPERATOR_PHONE } from './helpers.ts';
import type { FulfillmentTest } from './helpers.ts';

const logTemp = (
  test: FulfillmentTest,
  body: Record<string, unknown>,
  cookie: string = test.operator,
  fridgeId: string = test.fridgeId,
) => call(test, 'POST', `/operator/fridges/${fridgeId}/temperature`, cookie, body);

const events = (test: FulfillmentTest) =>
  test.app.deps.system.events.list({ kind: 'temperature_out_of_range' });

describe('журнал температуры (R34.1)', () => {
  it('замер в диапазоне 0…+5 °C записывается без события; границы включительно', async () => {
    const test = await makeFulfillmentApp();
    const ok = await logTemp(test, { slot: 'morning', celsius: 3.5 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().entry).toMatchObject({
      fridgeId: test.fridgeId,
      date: '2026-03-10',
      slot: 'morning',
      celsius: 3.5,
      outOfRange: false,
    });
    expect((await logTemp(test, { slot: 'evening', celsius: 0 })).json().entry.outOfRange).toBe(
      false,
    );
    expect((await logTemp(test, { slot: 'evening', celsius: 5 })).json().entry.outOfRange).toBe(
      false,
    );
    expect(events(test)).toHaveLength(0);
  });

  it('значение вне диапазона подсвечивается и попадает в события с холодильником, замером и значением', async () => {
    const test = await makeFulfillmentApp();
    const hot = await logTemp(test, { slot: 'evening', celsius: 7.2 });
    expect(hot.statusCode).toBe(201);
    expect(hot.json().entry.outOfRange).toBe(true);
    const cold = await logTemp(test, { slot: 'morning', celsius: -0.1 });
    expect(cold.json().entry.outOfRange).toBe(true);
    expect((await logTemp(test, { slot: 'morning', celsius: 5.1 })).json().entry.outOfRange).toBe(
      true,
    );
    const logged = events(test);
    expect(logged).toHaveLength(3);
    expect(logged.map((e) => e.detail.celsius).sort()).toEqual([-0.1, 5.1, 7.2]);
    expect(logged.find((e) => e.detail.celsius === 7.2)!.detail).toMatchObject({
      fridgeId: test.fridgeId,
      slot: 'evening',
      date: '2026-03-10',
    });
  });

  it('повторный ввод того же замера исправляет значение: за день не больше двух записей', async () => {
    const test = await makeFulfillmentApp();
    await logTemp(test, { slot: 'morning', celsius: 9 });
    test.clock.advance(60_000);
    const fixed = await logTemp(test, { slot: 'morning', celsius: 4 });
    expect(fixed.json().entry).toMatchObject({ celsius: 4, outOfRange: false });
    const list = await call(
      test,
      'GET',
      `/operator/fridges/${test.fridgeId}/temperature`,
      test.operator,
    );
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0]).toMatchObject({ slot: 'morning', celsius: 4 });
    // график дня показывает оба замера по слотам
    await logTemp(test, { slot: 'evening', celsius: 2 });
    const day = (await dayOf(test, test.operator, test.fridgeId, '2026-03-10')).json();
    expect(day.temperature.morning.celsius).toBe(4);
    expect(day.temperature.evening.celsius).toBe(2);
  });

  it('неверные данные отвергаются; чужой холодильник и посторонние роли — нет доступа', async () => {
    const test = await makeFulfillmentApp();
    expect((await logTemp(test, { slot: 'noon', celsius: 3 })).statusCode).toBe(400);
    expect((await logTemp(test, { slot: 'morning', celsius: 99 })).statusCode).toBe(400);
    expect((await logTemp(test, { slot: 'morning', celsius: 'cold' })).statusCode).toBe(400);
    expect((await logTemp(test, { slot: 'morning' })).statusCode).toBe(400);

    const second = await addFridge(test);
    expect(
      (await logTemp(test, { slot: 'morning', celsius: 3 }, test.operator, second)).statusCode,
    ).toBe(403);
    expect((await logTemp(test, { slot: 'morning', celsius: 3 }, test.client)).statusCode).toBe(
      403,
    );
    expect(
      (await logTemp(test, { slot: 'morning', celsius: 3 }, test.admin, second)).statusCode,
    ).toBe(201);
  });
});

describe('пропущенные замеры для администратора (R34.2)', () => {
  const missed = (test: FulfillmentTest, query = '', cookie: string = test.admin) =>
    call(test, 'GET', `/admin/temperature/missed${query}`, cookie);

  it('пока срок замера не наступил, пропуска нет; после срока слот без записи попадает в список', async () => {
    const test = await makeFulfillmentApp();
    // 11:00 по Кишинёву: утренний замер ждём до 12:00, вечерний до 22:00
    expect((await missed(test)).json().items).toEqual([]);

    test.clock.set('2026-03-10T10:30:00Z'); // 12:30
    const noon = (await missed(test)).json();
    expect(noon.items).toEqual([
      expect.objectContaining({
        fridgeId: test.fridgeId,
        date: '2026-03-10',
        slot: 'morning',
      }),
    ]);
    expect(noon.items[0].fridgeName).toBeTruthy();
    expect(noon.items[0].gymName).toBeTruthy();

    // внесли утренний замер — пропуск исчезает
    await logTemp(test, { slot: 'morning', celsius: 3 });
    expect((await missed(test)).json().items).toEqual([]);
  });

  it('на следующий день вчерашний вечер и сегодняшнее утро без записей — в списке, свежие сверху', async () => {
    const test = await makeFulfillmentApp();
    test.clock.set('2026-03-10T08:00:00Z'); // 10:00, утренний замер ждёт до 12:00
    await logTemp(test, { slot: 'morning', celsius: 3 });
    test.clock.set('2026-03-11T10:00:00Z'); // 12:00 следующего дня
    const items = (await missed(test)).json().items as Array<{ date: string; slot: string }>;
    expect(items.map((i) => `${i.date}/${i.slot}`)).toEqual([
      '2026-03-11/morning',
      '2026-03-10/evening',
    ]);
    // ограничение периода
    const only = (await missed(test, '?from=2026-03-11&to=2026-03-11')).json();
    expect(only.items.map((i: { slot: string }) => i.slot)).toEqual(['morning']);
    expect(only.from).toBe('2026-03-11');
  });

  it('дни до создания холодильника не считаются; период проверяется', async () => {
    const test = await makeFulfillmentApp();
    test.clock.set('2026-03-12T10:00:00Z');
    const items = (await missed(test, '?from=2026-03-01&to=2026-03-12')).json().items as Array<{
      date: string;
    }>;
    expect(Math.min(...items.map((i) => Number(i.date.slice(-2))))).toBe(10);
    expect((await missed(test, '?from=2026-03-12&to=2026-03-01')).statusCode).toBe(400);
    expect((await missed(test, '?from=2025-01-01&to=2026-03-12')).statusCode).toBe(400);
  });

  it('список видит только администратор', async () => {
    const test = await makeFulfillmentApp();
    expect((await missed(test, '', test.operator)).statusCode).toBe(403);
    expect((await missed(test, '', test.client)).statusCode).toBe(403);
    expect((await missed(test, '', test.kitchen)).statusCode).toBe(403);
    expect((await call(test, 'GET', '/admin/temperature/missed')).statusCode).toBe(401);
    // оператор другого холодильника не меняет список администратора
    const other = await login(test, OTHER_OPERATOR_PHONE);
    setRole(test.app, OTHER_OPERATOR_PHONE, 'operator');
    authFor(test.app.deps).setOperatorFridges(userId(test.app, OTHER_OPERATOR_PHONE), []);
    expect((await missed(test, '', other)).statusCode).toBe(403);
  });
});
