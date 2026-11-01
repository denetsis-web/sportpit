import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import { kitchenFor } from '../../src/modules/kitchen/index.ts';
import { as, login, setRole } from '../auth/helpers.ts';
import {
  call,
  CUTOFF_UTC,
  makeKitchenApp,
  OPERATOR_PHONE,
  placeOk,
  runCloseJob,
  summary,
  TOMORROW,
  type KitchenTest,
} from './helpers.ts';

describe('доступ к кухне (R13)', () => {
  it('кухня и администратор видят сводку; клиент, оператор и гость — нет', async () => {
    const test = await makeKitchenApp();
    const operator = await login(test, OPERATOR_PHONE);
    setRole(test.app, OPERATOR_PHONE, 'operator');
    const url = `/kitchen/summary?date=${TOMORROW}`;
    expect((await call(test, 'GET', url, test.kitchen)).statusCode).toBe(200);
    expect((await call(test, 'GET', url, test.admin)).statusCode).toBe(200);
    expect((await call(test, 'GET', url, test.client)).statusCode).toBe(403);
    expect((await call(test, 'GET', url, operator)).statusCode).toBe(403);
    expect((await call(test, 'GET', url)).statusCode).toBe(401);
  });

  it('партию подтверждают и отмечают только кухня и администратор', async () => {
    const test = await makeKitchenApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 1 }] });
    test.clock.set(CUTOFF_UTC);
    await runCloseJob(test);
    const batch = (await summary(test)).dishes[0]!.batch!;
    for (const path of [
      `/kitchen/batches/${batch.id}/confirm`,
      `/kitchen/batches/${batch.id}/cooked`,
    ]) {
      expect((await call(test, 'POST', path, test.client)).statusCode).toBe(403);
      expect((await call(test, 'POST', path)).statusCode).toBe(401);
    }
    expect(
      (await call(test, 'GET', `/kitchen/batches/${batch.id}/label`, test.client)).statusCode,
    ).toBe(403);
    // запись без заголовка X-Requested-With отвергается каркасом
    const noHeader = await test.app.inject({
      method: 'POST',
      url: `/api/v1/kitchen/batches/${batch.id}/confirm`,
      headers: { cookie: test.kitchen },
    });
    expect(noHeader.statusCode).toBe(403);
    // действия кухни попали в журнал действий
    await call(test, 'POST', `/kitchen/batches/${batch.id}/confirm`, test.kitchen);
    const audit = adminFor(test.deps)
      .listAudit()
      .items.map((e) => e.action);
    expect(audit).toContain('kitchen.confirm');
  });

  it('сводка без даты — на завтра; неверная дата — 400', async () => {
    const test = await makeKitchenApp();
    const res = await call(test, 'GET', '/kitchen/summary', test.kitchen);
    expect(res.json().date).toBe(TOMORROW);
    const bad = await call(test, 'GET', '/kitchen/summary?date=2026-13-45', test.kitchen);
    expect(bad.statusCode).toBe(400);
  });
});

async function cookedBatch(test: KitchenTest) {
  await placeOk(test, test.client, { items: [{ dishId: test.dishes[1], qty: 2 }] });
  test.clock.set(CUTOFF_UTC);
  await runCloseJob(test);
  const batch = (await summary(test)).dishes[0]!.batch!;
  const kitchen = kitchenFor(test.deps);
  kitchen.confirmProduction(batch.id, test.kitchenId);
  test.clock.set('2026-03-10T19:45:00Z');
  kitchen.markCooked(batch.id, test.kitchenId);
  return batch;
}

describe('данные этикетки (R33)', () => {
  it('название на RU и RO, КБЖУ, состав, аллергены, время приготовления, «съесть до», код партии, размер из настроек', async () => {
    const test = await makeKitchenApp();
    adminFor(test.deps).setSetting('labelSize', '58x40', test.adminId);
    const batch = await cookedBatch(test);
    const res = await call(test, 'GET', `/kitchen/batches/${batch.id}/label`, test.kitchen);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      batchId: batch.id,
      code: batch.code,
      date: TOMORROW,
      copies: 2,
      dish: {
        name: { ru: 'Лосось с овощами', ro: 'Somon cu legume' },
        calories: 480,
        proteinG: 42,
        fatG: 14,
        carbsG: 55,
        composition: {
          ru: 'куриная грудка, рис, брокколи',
          ro: 'piept de pui, orez, broccoli',
        },
        allergens: [],
      },
      cookedAt: '2026-03-10T19:45:00.000Z',
      eatBy: '2026-03-13T19:45:00.000Z',
      size: { widthMm: 58, heightMm: 40 },
    });
  });

  it('размер по умолчанию — 70x50; этикетка не меняется, если блюдо потом поправили', async () => {
    const test = await makeKitchenApp();
    const batch = await cookedBatch(test);
    const dishId = test.dishes[1];
    const fixed = await call(test, 'PATCH', `/admin/dishes/${dishId}`, test.admin, {
      nameRu: 'Лосось по-новому',
      calories: 999,
    });
    expect(fixed.statusCode).toBe(200);
    const label = (
      await call(test, 'GET', `/kitchen/batches/${batch.id}/label`, test.kitchen)
    ).json();
    expect(label.size).toEqual({ widthMm: 70, heightMm: 50 });
    expect(label.dish.name.ru).toBe('Лосось с овощами');
    expect(label.dish.calories).toBe(480);
  });

  it('печатать нечего, пока партия не приготовлена: 409 на языке запроса', async () => {
    const test = await makeKitchenApp();
    await placeOk(test, test.client, { items: [{ dishId: test.dishes[0], qty: 1 }] });
    test.clock.set(CUTOFF_UTC);
    await runCloseJob(test);
    const batch = (await summary(test)).dishes[0]!.batch!;
    const ru = await call(test, 'GET', `/kitchen/batches/${batch.id}/label`, test.kitchen);
    expect(ru.statusCode).toBe(409);
    expect(ru.json().error.code).toBe('batch_not_cooked');
    expect(ru.json().error.message).toMatch(/приготовленной/);
    const ro = await test.app.inject({
      method: 'GET',
      url: `/api/v1/kitchen/batches/${batch.id}/label`,
      headers: { ...as(test.kitchen), 'accept-language': 'ro' },
    });
    expect(ro.json().error.message).toMatch(/pregătit/);
  });
});

describe('задача по расписанию', () => {
  it('kitchen-close зарегистрирована в планировщике', async () => {
    const test = await makeKitchenApp();
    expect(test.app.deps.system.scheduler.list().map((j) => j.name)).toContain('kitchen-close');
  });
});
