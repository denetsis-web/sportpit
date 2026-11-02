// Последнего администратора нельзя удалить и лишить роли (F1.11).
import { describe, expect, it } from 'vitest';
import { authFor, upsertUserWithRole } from '../../src/modules/auth/index.ts';
import { api, clientWithConsent, makeApp, OTHER_PHONE, PHONE, userId } from '../profile/helpers.ts';
import { setRole } from './helpers.ts';

const deleteBody = { confirm: true };

describe('последний администратор', () => {
  it('удалить свой аккаунт нельзя: 409 с понятным текстом, ничего не стёрто', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    setRole(test.app, PHONE, 'admin');
    const id = userId(test.app, PHONE);

    const res = await api(test, 'POST', '/profile/account/delete', cookie, deleteBody);

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('last_admin');
    expect(res.json().error.message).toContain('администратор');
    const row = test.app.deps.db.get<{ phone: string | null; role: string }>(
      'SELECT phone, role FROM users WHERE id = ?',
      [id],
    )!;
    expect(row).toEqual({ phone: PHONE, role: 'admin' });
    expect((await api(test, 'GET', '/auth/me', cookie)).statusCode).toBe(200);
  });

  it('если есть второй администратор, аккаунт удаляется; тогда оставшийся уже последний', async () => {
    const test = await makeApp();
    const first = await clientWithConsent(test, PHONE);
    setRole(test.app, PHONE, 'admin');
    const second = await clientWithConsent(test, OTHER_PHONE);
    setRole(test.app, OTHER_PHONE, 'admin');

    expect((await api(test, 'POST', '/profile/account/delete', first, deleteBody)).statusCode).toBe(
      200,
    );
    const again = await api(test, 'POST', '/profile/account/delete', second, deleteBody);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('last_admin');
  });

  it('снять роль admin с последнего нельзя ни через сервис, ни через команду create-user', async () => {
    const test = await makeApp();
    await clientWithConsent(test, PHONE);
    setRole(test.app, PHONE, 'admin');
    const id = userId(test.app, PHONE);
    const auth = authFor(test.app.deps);

    expect(() => auth.setRole(id, 'client')).toThrow(/last_admin/);
    expect(() =>
      upsertUserWithRole(test.app.deps.db, test.app.deps.clock, PHONE, 'kitchen'),
    ).toThrow(/last_admin/);
    expect(auth.getUser(id)!.role).toBe('admin');

    // повторное назначение той же роли и смена роли другому — без ошибок
    expect(() => auth.setRole(id, 'admin')).not.toThrow();
    setRole(test.app, OTHER_PHONE, 'client');
  });

  it('через API: администратор снимает роль со второго, но не может остаться без администраторов', async () => {
    const test = await makeApp();
    const adminCookie = await clientWithConsent(test, PHONE);
    setRole(test.app, PHONE, 'admin');
    await clientWithConsent(test, OTHER_PHONE);
    setRole(test.app, OTHER_PHONE, 'admin');

    const demote = await api(
      test,
      'PUT',
      `/auth/users/${userId(test.app, OTHER_PHONE)}/role`,
      adminCookie,
      { role: 'client' },
    );
    expect(demote.statusCode).toBe(200);
    const self = await api(
      test,
      'PUT',
      `/auth/users/${userId(test.app, PHONE)}/role`,
      adminCookie,
      {
        role: 'client',
      },
    );
    expect(self.statusCode).toBe(400); // свою роль менять нельзя
    expect(
      test.app.deps.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")!
        .n,
    ).toBe(1);
  });
});
