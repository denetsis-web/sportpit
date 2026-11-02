import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import {
  as,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  setRole,
  userId,
  WRITE,
  type TestApp,
} from './helpers.ts';

const THIRD_PHONE = '+37379000111';

async function loginAs(test: TestApp, phone: string, role: string): Promise<string> {
  const cookie = await login(test, phone);
  setRole(test.app, phone, role);
  test.clock.advance(2 * 60 * 1000); // чтобы следующий вход не упёрся в лимит запросов кода
  return cookie;
}

const get = (test: TestApp, url: string, cookie?: string) =>
  test.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: cookie ? as(cookie) : {} });
const post = (test: TestApp, url: string, cookie?: string, payload: unknown = {}) =>
  test.app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: cookie ? as(cookie, WRITE) : WRITE,
  });

describe('requireRole', () => {
  it('без входа — 401, клиент на чужой раздел — 403 с текстом «Нет доступа» на RU и RO', async () => {
    const test = await makeApp();
    const anonymous = await get(test, '/gate/admin');
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe('unauthorized');

    const cookie = await login(test);
    const denied = await get(test, '/gate/admin', cookie);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('forbidden');
    expect(denied.json().error.message).toBe('Нет доступа.');
    const ro = await test.app.inject({
      method: 'GET',
      url: '/api/v1/gate/admin',
      headers: as(cookie, { 'accept-language': 'ro' }),
    });
    expect(ro.json().error.message).toBe('Acces interzis.');
  });

  it('роль из списка проходит, остальные нет', async () => {
    const test = await makeApp();
    const admin = await loginAs(test, PHONE, 'admin');
    const kitchen = await loginAs(test, OTHER_PHONE, 'kitchen');
    expect((await get(test, '/gate/admin', admin)).statusCode).toBe(200);
    expect((await get(test, '/gate/admin', kitchen)).statusCode).toBe(403);
    expect((await get(test, '/gate/staff', kitchen)).statusCode).toBe(200);
    expect((await get(test, '/gate/staff', admin)).statusCode).toBe(403);
  });

  it('requireRole() без ролей пускает любого вошедшего', async () => {
    const test = await makeApp();
    expect((await get(test, '/gate/any')).statusCode).toBe(401);
    expect((await get(test, '/gate/any', await login(test))).statusCode).toBe(200);
  });

  it('смена роли действует со следующего запроса, повторный вход не нужен', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    expect((await get(test, '/gate/admin', cookie)).statusCode).toBe(403);
    setRole(test.app, PHONE, 'admin');
    expect((await get(test, '/gate/admin', cookie)).statusCode).toBe(200);
  });
});

describe('холодильники оператора', () => {
  async function operatorWith(test: TestApp, fridges: string[]) {
    const admin = await loginAs(test, PHONE, 'admin');
    const operator = await loginAs(test, OTHER_PHONE, 'operator');
    const set = await test.app.inject({
      method: 'PUT',
      url: `/api/v1/auth/users/${userId(test.app, OTHER_PHONE)}/fridges`,
      payload: { fridgeIds: fridges },
      headers: as(admin, WRITE),
    });
    expect(set.statusCode).toBe(200);
    return { admin, operator };
  }

  it('оператор действует над своим холодильником и получает 403 над чужим', async () => {
    const test = await makeApp();
    const { operator } = await operatorWith(test, ['3', '5']);
    expect((await post(test, '/gate/fridges/3/load', operator)).statusCode).toBe(200);
    expect((await post(test, '/gate/fridges/5/load', operator)).statusCode).toBe(200);
    const foreign = await post(test, '/gate/fridges/4/load', operator);
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().error.message).toBe('Нет доступа.');
  });

  it('идентификатор холодильника в теле запроса проверяется императивно', async () => {
    const test = await makeApp();
    const { operator } = await operatorWith(test, ['3']);
    expect((await post(test, '/gate/by-body', operator, { fridgeId: '3' })).statusCode).toBe(200);
    expect((await post(test, '/gate/by-body', operator, { fridgeId: '9' })).statusCode).toBe(403);
  });

  it('числовой идентификатор сравнивается как строка; оператор без холодильников не проходит никуда', async () => {
    const test = await makeApp();
    const { operator } = await operatorWith(test, ['7']);
    expect((await get(test, '/gate/fixed-fridge', operator)).statusCode).toBe(200);
    const admin = await loginAs(test, THIRD_PHONE, 'admin');
    expect((await get(test, '/gate/fixed-fridge', admin)).statusCode).toBe(200);

    await test.app.inject({
      method: 'PUT',
      url: `/api/v1/auth/users/${userId(test.app, OTHER_PHONE)}/fridges`,
      payload: { fridgeIds: [] },
      headers: as(admin, WRITE),
    });
    expect((await get(test, '/gate/fixed-fridge', operator)).statusCode).toBe(403);
  });

  it('администратор — любой холодильник, кухня и клиент — ни одного, без входа — 401', async () => {
    const test = await makeApp();
    const admin = await loginAs(test, PHONE, 'admin');
    const kitchen = await loginAs(test, OTHER_PHONE, 'kitchen');
    const client = await loginAs(test, THIRD_PHONE, 'client');
    expect((await get(test, '/gate/fixed-fridge', admin)).statusCode).toBe(200);
    expect((await get(test, '/gate/fixed-fridge', kitchen)).statusCode).toBe(403);
    expect((await get(test, '/gate/fixed-fridge', client)).statusCode).toBe(403);
    expect((await get(test, '/gate/fixed-fridge')).statusCode).toBe(401);
  });

  it('привязка к холодильникам действует только пока пользователь — оператор', async () => {
    const test = await makeApp();
    const { operator } = await operatorWith(test, ['3']);
    setRole(test.app, OTHER_PHONE, 'client');
    expect((await post(test, '/gate/fridges/3/load', operator)).statusCode).toBe(403);
  });
});

describe('управление ролями (администратор)', () => {
  it('назначение роли и список пользователей доступны только администратору', async () => {
    const test = await makeApp();
    const client = await login(test, OTHER_PHONE);
    const admin = await loginAs(test, PHONE, 'admin');
    const target = userId(test.app, OTHER_PHONE);

    const denied = await test.app.inject({
      method: 'PUT',
      url: `/api/v1/auth/users/${target}/role`,
      payload: { role: 'admin' },
      headers: as(client, WRITE),
    });
    expect(denied.statusCode).toBe(403);
    expect((await get(test, '/auth/users', client)).statusCode).toBe(403);

    const ok = await test.app.inject({
      method: 'PUT',
      url: `/api/v1/auth/users/${target}/role`,
      payload: { role: 'kitchen' },
      headers: as(admin, WRITE),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user).toMatchObject({ id: target, role: 'kitchen' });
    const list = await get(test, '/auth/users', admin);
    expect(list.json().items.map((u: { phone: string }) => u.phone)).toEqual([OTHER_PHONE, PHONE]);

    const badRole = await test.app.inject({
      method: 'PUT',
      url: `/api/v1/auth/users/${target}/role`,
      payload: { role: 'superuser' },
      headers: as(admin, WRITE),
    });
    expect(badRole.statusCode).toBe(400);
    const missing = await test.app.inject({
      method: 'PUT',
      url: '/api/v1/auth/users/9999/role',
      payload: { role: 'kitchen' },
      headers: as(admin, WRITE),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('администратор не может снять роль с самого себя', async () => {
    const test = await makeApp();
    const admin = await loginAs(test, PHONE, 'admin');
    const res = await test.app.inject({
      method: 'PUT',
      url: `/api/v1/auth/users/${userId(test.app, PHONE)}/role`,
      payload: { role: 'client' },
      headers: as(admin, WRITE),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('own_role');
  });

  const put = (test: TestApp, url: string, cookie: string, payload: unknown) =>
    test.app.inject({
      method: 'PUT',
      url: `/api/v1${url}`,
      payload: payload as object,
      headers: as(cookie, WRITE),
    });

  it('смена роли и холодильников оператора пишется в журнал действий', async () => {
    const test = await makeApp();
    const admin = await loginAs(test, PHONE, 'admin');
    await login(test, OTHER_PHONE);
    const target = userId(test.app, OTHER_PHONE);
    const adminId = userId(test.app, PHONE);

    expect(
      (await put(test, `/auth/users/${target}/role`, admin, { role: 'operator' })).statusCode,
    ).toBe(200);
    expect(
      (await put(test, `/auth/users/${target}/fridges`, admin, { fridgeIds: ['3', '5'] }))
        .statusCode,
    ).toBe(200);

    const entries = adminFor(test.app.deps).listAudit().items;
    expect(entries.find((e) => e.action === 'user.role')).toMatchObject({
      userId: adminId,
      target: `user:${target}`,
      detail: { from: 'client', to: 'operator' },
    });
    expect(entries.find((e) => e.action === 'user.fridges')).toMatchObject({
      userId: adminId,
      target: `user:${target}`,
      detail: { fridgeIds: ['3', '5'] },
    });
  });

  it('снять роль operator и назначить заново — холодильников нет', async () => {
    const test = await makeApp();
    const admin = await loginAs(test, PHONE, 'admin');
    await login(test, OTHER_PHONE);
    const target = userId(test.app, OTHER_PHONE);
    await put(test, `/auth/users/${target}/role`, admin, { role: 'operator' });
    await put(test, `/auth/users/${target}/fridges`, admin, { fridgeIds: ['3'] });

    await put(test, `/auth/users/${target}/role`, admin, { role: 'client' });
    expect(
      test.app.deps.db.query('SELECT 1 FROM operator_fridges WHERE user_id = ?', [target]),
    ).toHaveLength(0);
    const again = await put(test, `/auth/users/${target}/role`, admin, { role: 'operator' });
    expect(again.json().user.fridgeIds).toEqual([]);
  });

  it('PATCH /auth/me с полем role роль не меняет', async () => {
    const test = await makeApp();
    const client = await login(test, OTHER_PHONE);
    const res = await test.app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { lang: 'ro', role: 'admin' },
      headers: as(client, WRITE),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ role: 'client', lang: 'ro' });
    expect(
      test.app.deps.db.get<{ role: string }>('SELECT role FROM users WHERE phone = ?', [
        OTHER_PHONE,
      ])!.role,
    ).toBe('client');
    expect((await get(test, '/auth/users', client)).statusCode).toBe(403);
  });
});
