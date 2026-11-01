import { describe, expect, it } from 'vitest';
import { profileFor, registerExportProvider } from '../../src/modules/profile/index.ts';
import {
  api,
  clientWithConsent,
  makeApp,
  OTHER_PHONE,
  PHONE,
  SAMPLE,
  userId,
  type TestApp,
} from './helpers.ts';

/** Имитация модулей с данными клиента: заказы и оценки лежат «по пользователям». */
function registerFakeModules(test: TestApp, ids: { mine: number; other: number }) {
  const orders = new Map<number, unknown[]>([
    [ids.mine, [{ id: 'order-A1', date: '2026-03-12' }]],
    [ids.other, [{ id: 'order-B1', date: '2026-03-12' }]],
  ]);
  const ratings = new Map<number, unknown[]>([
    [ids.mine, [{ dish: 'dish-A', stars: 5 }]],
    [ids.other, [{ dish: 'dish-B', stars: 1 }]],
  ]);
  const calls: number[] = [];
  registerExportProvider(test.app.deps, 'fake_orders', (userId) => {
    calls.push(userId);
    return { items: orders.get(userId) ?? [] };
  });
  profileFor(test.app.deps).registerExportProvider('ratings', (userId) => ({
    items: ratings.get(userId) ?? [],
  }));
  return { calls };
}

describe('выгрузка данных (R29.1)', () => {
  it('без входа — 401', async () => {
    const test = await makeApp();
    expect((await api(test, 'GET', '/profile/export')).statusCode).toBe(401);
  });

  it('отдаёт JSON-файл с профилем, согласиями и данными зарегистрированных модулей', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    registerFakeModules(test, { mine: userId(test.app, PHONE), other: 999 });

    const res = await api(test, 'GET', '/profile/export', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('no-store');

    const body = res.json();
    expect(body.user).toMatchObject({ id: userId(test.app, PHONE), phone: PHONE, lang: 'ru' });
    expect(body.profile).toMatchObject(SAMPLE);
    expect(body.consents.find((c: { kind: string }) => c.kind === 'health_data')).toMatchObject({
      granted: true,
    });
    expect(body.data.fake_orders).toEqual({ items: [{ id: 'order-A1', date: '2026-03-12' }] });
    expect(body.data.ratings).toEqual({ items: [{ dish: 'dish-A', stars: 5 }] });
    expect(typeof body.exportedAt).toBe('string');
  });

  it('содержит данные только текущего пользователя и ничьи больше', async () => {
    const test = await makeApp();
    const mine = await clientWithConsent(test, PHONE);
    const other = await clientWithConsent(test, OTHER_PHONE);
    const ids = { mine: userId(test.app, PHONE), other: userId(test.app, OTHER_PHONE) };
    await api(test, 'PUT', '/profile', mine, SAMPLE);
    await api(test, 'PUT', '/profile', other, { ...SAMPLE, weightKg: 91.5 });
    const { calls } = registerFakeModules(test, ids);

    const res = await api(test, 'GET', '/profile/export', mine);
    expect(calls).toEqual([ids.mine]);
    for (const foreign of [OTHER_PHONE, 'order-B1', 'dish-B', '91.5']) {
      expect(res.body, foreign).not.toContain(foreign);
    }

    const theirs = await api(test, 'GET', '/profile/export', other);
    expect(theirs.json().user.phone).toBe(OTHER_PHONE);
    expect(theirs.body).not.toContain(PHONE);
    expect(theirs.body).not.toContain('order-A1');
    expect(theirs.json().data.fake_orders.items).toEqual([{ id: 'order-B1', date: '2026-03-12' }]);
  });

  it('без зарегистрированных модулей выгрузка всё равно работает: профиль и согласия', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const res = await api(test, 'GET', '/profile/export', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ profile: null, data: {} });
  });

  it('сбой поставщика не даёт неполной выгрузки: 500', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    profileFor(test.app.deps).registerExportProvider('fake_orders', () => {
      throw new Error('сбой модуля');
    });
    expect((await api(test, 'GET', '/profile/export', cookie)).statusCode).toBe(500);
  });

  it('имя поставщика проверяется, повторная регистрация отвергается', async () => {
    const test = await makeApp();
    const profile = profileFor(test.app.deps);
    profile.registerExportProvider('fake_orders', () => ({}));
    expect(() => profile.registerExportProvider('fake_orders', () => ({}))).toThrow();
    expect(() => profile.registerExportProvider('Bad Name', () => ({}))).toThrow();
  });
});
