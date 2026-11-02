import { describe, expect, it } from 'vitest';
import { profileFor } from '../../src/modules/profile/index.ts';
import {
  api,
  clientWithConsent,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  SAMPLE,
  userId,
  type TestApp,
} from './helpers.ts';

interface UserRow {
  phone: string | null;
  role: string;
  deleted_at: string | null;
}
const userRow = (test: TestApp, id: number) =>
  test.app.deps.db.get<UserRow>('SELECT phone, role, deleted_at FROM users WHERE id = ?', [id])!;
const count = (test: TestApp, table: string, id: number, column = 'user_id') =>
  test.app.deps.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, [
    id,
  ])!.n;

describe('удаление аккаунта (R29)', () => {
  it('без входа — 401; без подтверждения — 400 и ничего не стирается', async () => {
    const test = await makeApp();
    expect(
      (await api(test, 'POST', '/profile/account/delete', undefined, { confirm: true })).statusCode,
    ).toBe(401);

    const cookie = await clientWithConsent(test, PHONE);
    const id = userId(test.app, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    for (const body of [{}, { confirm: false }, { confirm: 'yes' }]) {
      const res = await api(test, 'POST', '/profile/account/delete', cookie, body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('confirm_required');
    }
    expect(userRow(test, id)).toMatchObject({ phone: PHONE, deleted_at: null });
    expect(count(test, 'profiles', id)).toBe(1);
    expect((await api(test, 'GET', '/auth/me', cookie)).json().user).toMatchObject({ id });
  });

  it('с подтверждением: телефон и анкета стёрты, сессия закрыта, строка и история согласий остаются', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const id = userId(test.app, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);

    const res = await api(test, 'POST', '/profile/account/delete', cookie, { confirm: true });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === 'sp_session')?.value ?? '').toBe('');

    // строка пользователя осталась «пустой» — на неё ссылаются заказы и журнал кредитов
    expect(userRow(test, id)).toMatchObject({ phone: null, role: 'client' });
    expect(userRow(test, id).deleted_at).not.toBeNull();
    expect(count(test, 'profiles', id)).toBe(0);
    expect(count(test, 'sessions', id)).toBe(0);
    expect(count(test, 'consents', id)).toBeGreaterThan(0);

    // старая cookie больше не пускает
    expect((await api(test, 'GET', '/auth/me', cookie)).json().user).toBeNull();
    expect((await api(test, 'GET', '/profile', cookie)).statusCode).toBe(401);
    // номера нигде не осталось
    const dump = JSON.stringify(test.app.deps.db.query('SELECT * FROM users'));
    expect(dump).not.toContain(PHONE);
  });

  it('повторный вход по тому же номеру создаёт новый аккаунт без анкеты и согласий', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const oldId = userId(test.app, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    await api(test, 'POST', '/profile/account/delete', cookie, { confirm: true });

    test.clock.advance(2 * 60 * 1000);
    const again = await login(test, PHONE);
    const newId = userId(test.app, PHONE);
    expect(newId).not.toBe(oldId);
    expect(await api(test, 'GET', '/profile', again).then((r) => r.json())).toEqual({
      profile: null,
      targets: null,
      healthConsent: false,
    });
    expect(userRow(test, oldId).phone).toBeNull();
  });

  it('удаление одного аккаунта не трогает чужой', async () => {
    const test = await makeApp();
    const mine = await clientWithConsent(test, PHONE);
    const other = await clientWithConsent(test, OTHER_PHONE);
    await api(test, 'PUT', '/profile', mine, SAMPLE);
    await api(test, 'PUT', '/profile', other, { ...SAMPLE, goal: 'gain' });
    await api(test, 'POST', '/profile/account/delete', mine, { confirm: true });
    const res = await api(test, 'GET', '/profile', other);
    expect(res.json().profile).toMatchObject({ goal: 'gain' });
    expect(userRow(test, userId(test.app, OTHER_PHONE)).phone).toBe(OTHER_PHONE);
  });

  it('хуки других модулей стирают их персональные данные в той же транзакции', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const id = userId(test.app, PHONE);
    const erased: number[] = [];
    profileFor(test.app.deps).registerDeletionHook('diary', (userId) => {
      erased.push(userId);
    });
    await api(test, 'POST', '/profile/account/delete', cookie, { confirm: true });
    expect(erased).toEqual([id]);

    // сбой хука откатывает всё: аккаунт остаётся целым
    const test2 = await makeApp();
    const cookie2 = await clientWithConsent(test2, PHONE);
    profileFor(test2.app.deps).registerDeletionHook('broken', () => {
      throw new Error('сбой');
    });
    const failed = await api(test2, 'POST', '/profile/account/delete', cookie2, { confirm: true });
    expect(failed.statusCode).toBe(500);
    expect(userRow(test2, userId(test2.app, PHONE)).deleted_at).toBeNull();
  });

  it('хук удаления, вернувший промис, — ошибка: аккаунт остаётся целым, а тип такой хук не пропускает', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const id = userId(test.app, PHONE);
    const profile = profileFor(test.app.deps);

    // @ts-expect-error — тип DeletionHook не допускает функцию, возвращающую промис
    profile.registerDeletionHook('async_diary', async () => undefined);
    // а синхронный хук (в том числе с выражением-телом, возвращающим не промис) проходит проверку типов
    profile.registerDeletionHook('sync_diary', (uid, tx) => {
      tx.run('DELETE FROM sessions WHERE user_id = ? AND 1 = 0', [uid]);
    });

    const failed = await api(test, 'POST', '/profile/account/delete', cookie, { confirm: true });
    expect(failed.statusCode).toBe(500);
    expect(userRow(test, id)).toMatchObject({ phone: PHONE, deleted_at: null });
    expect((await api(test, 'GET', '/auth/me', cookie)).statusCode).toBe(200);
  });
});
