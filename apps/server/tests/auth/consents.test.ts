import { describe, expect, it } from 'vitest';
import { CONSENT_VERSIONS } from '@sportpit/shared/schemas/auth';
import { authFor } from '../../src/modules/auth/index.ts';
import {
  as,
  codeFromSms,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  userId,
  WRITE,
  type TestApp,
} from './helpers.ts';

const consents = (test: TestApp, cookie?: string) =>
  test.app.inject({
    method: 'GET',
    url: '/api/v1/auth/consents',
    headers: cookie ? as(cookie) : {},
  });

const grant = (
  test: TestApp,
  cookie: string,
  changes: Array<{ kind: string; granted: boolean; version?: string }>,
) =>
  test.app.inject({
    method: 'POST',
    url: '/api/v1/auth/consents',
    payload: {
      changes: changes.map((c) => ({
        version: CONSENT_VERSIONS[c.kind as keyof typeof CONSENT_VERSIONS],
        ...c,
      })),
    },
    headers: as(cookie, WRITE),
  });

describe('согласия', () => {
  it('до решения все три не даны; без входа — 401', async () => {
    const test = await makeApp();
    expect((await consents(test)).statusCode).toBe(401);
    const cookie = await login(test);
    const res = await consents(test, cookie);
    expect(res.json().items).toEqual([
      {
        kind: 'terms',
        version: CONSENT_VERSIONS.terms,
        granted: false,
        decidedVersion: null,
        decidedAt: null,
      },
      {
        kind: 'privacy',
        version: CONSENT_VERSIONS.privacy,
        granted: false,
        decidedVersion: null,
        decidedAt: null,
      },
      {
        kind: 'health_data',
        version: CONSENT_VERSIONS.health_data,
        granted: false,
        decidedVersion: null,
        decidedAt: null,
      },
    ]);
  });

  it('согласие сохраняется с датой и версией текста, каждое отдельно', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    test.clock.set('2026-03-10T10:15:00Z');
    const res = await grant(test, cookie, [
      { kind: 'terms', granted: true },
      { kind: 'privacy', granted: true },
    ]);
    expect(res.statusCode).toBe(200);
    const byKind = Object.fromEntries(res.json().items.map((i: { kind: string }) => [i.kind, i]));
    expect(byKind.terms).toMatchObject({
      granted: true,
      decidedVersion: CONSENT_VERSIONS.terms,
      decidedAt: '2026-03-10T10:15:00.000Z',
    });
    expect(byKind.privacy.granted).toBe(true);
    expect(byKind.health_data.granted).toBe(false);
  });

  it('текст другой версии не принимается: человек не может согласиться на текст, которого нет', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    const res = await grant(test, cookie, [
      { kind: 'health_data', granted: true, version: '1999-01-01' },
    ]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('consent_version');
    expect(test.app.deps.db.query('SELECT 1 FROM consents')).toHaveLength(0);
  });

  it('все решения одного запроса сохраняются целиком или не сохраняются совсем', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    const res = await grant(test, cookie, [
      { kind: 'terms', granted: true },
      { kind: 'privacy', granted: true, version: 'stale' },
    ]);
    expect(res.statusCode).toBe(400);
    expect(test.app.deps.db.query('SELECT 1 FROM consents')).toHaveLength(0);
  });

  it('история: выдача, отзыв и новая выдача — три записи; повтор того же решения записи не добавляет', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    await grant(test, cookie, [{ kind: 'health_data', granted: true }]);
    await grant(test, cookie, [{ kind: 'health_data', granted: true }]);
    test.clock.advance(60_000);
    await grant(test, cookie, [{ kind: 'health_data', granted: false }]);
    test.clock.advance(60_000);
    const last = await grant(test, cookie, [{ kind: 'health_data', granted: true }]);
    const rows = test.app.deps.db.query<{ granted: number; version: string; created_at: string }>(
      'SELECT granted, version, created_at FROM consents ORDER BY id',
    );
    expect(rows.map((r) => r.granted)).toEqual([1, 0, 1]);
    expect(new Set(rows.map((r) => r.created_at)).size).toBe(3);
    expect(rows.every((r) => r.version === CONSENT_VERSIONS.health_data)).toBe(true);
    expect(last.json().items.find((i: { kind: string }) => i.kind === 'health_data').granted).toBe(
      true,
    );
  });

  it('согласие на старую версию текста не считается данным, пока человек не подтвердит новую', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    test.app.deps.db.run(
      "INSERT INTO consents (user_id, kind, version, granted, created_at) VALUES (?, 'terms', '2020-01-01', 1, '2020-01-01T00:00:00.000Z')",
      [userId(test.app, PHONE)],
    );
    const item = (await consents(test, cookie)).json().items[0];
    expect(item).toMatchObject({ kind: 'terms', granted: false, decidedVersion: '2020-01-01' });
  });
});

describe('requireConsent: анкета без согласия на данные о здоровье получает отказ', () => {
  const save = (test: TestApp, cookie?: string) =>
    test.app.inject({
      method: 'POST',
      url: '/api/v1/gate/profile',
      payload: {},
      headers: cookie ? as(cookie, WRITE) : WRITE,
    });

  it('401 без входа, 403 consent_required без согласия, 200 с согласием, снова 403 после отзыва', async () => {
    const test = await makeApp();
    expect((await save(test)).statusCode).toBe(401);
    const cookie = await login(test);
    const denied = await save(test, cookie);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('consent_required');
    // согласие на условия и политику здесь не заменяет согласие на данные о здоровье
    await grant(test, cookie, [
      { kind: 'terms', granted: true },
      { kind: 'privacy', granted: true },
    ]);
    expect((await save(test, cookie)).statusCode).toBe(403);
    await grant(test, cookie, [{ kind: 'health_data', granted: true }]);
    expect((await save(test, cookie)).statusCode).toBe(200);
    await grant(test, cookie, [{ kind: 'health_data', granted: false }]);
    expect((await save(test, cookie)).statusCode).toBe(403);
  });
});

describe('смена телефона и удаление аккаунта (для модуля профиля)', () => {
  it('телефон меняется только кодом, полученным на НОВЫЙ номер', async () => {
    const test = await makeApp();
    await login(test);
    const api = authFor(test.app.deps);
    const newPhone = '+37369111222';
    test.clock.advance(2 * 60_000);
    await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: newPhone },
      headers: WRITE,
    });
    const code = /\b(\d{6})\b/.exec(test.sms.last(newPhone)!.text)![1]!;
    const id = userId(test.app, PHONE);
    expect(() => api.changePhone(id, newPhone, code === '000000' ? '111111' : '000000')).toThrow();
    expect(api.getUser(id)!.phone).toBe(PHONE);
    expect(api.changePhone(id, newPhone, code).phone).toBe(newPhone);
    expect(api.findByPhone(PHONE)).toBeUndefined();
  });

  it('без верного кода занятый и свободный номер отвечают одинаково, занятость выясняется только после кода', async () => {
    const test = await makeApp();
    await login(test, OTHER_PHONE); // номер занят другим человеком
    test.clock.advance(2 * 60_000);
    await login(test);
    const api = authFor(test.app.deps);
    const id = userId(test.app, PHONE);
    const free = '+37369111222';
    const outcome = (phone: string, code: string) => {
      try {
        api.changePhone(id, phone, code);
        return 'ok';
      } catch (error) {
        const { status, code } = error as { status?: number; code?: string };
        return `${status}:${code}`;
      }
    };
    // кода на эти номера не запрашивали: ответ один и тот же, 409 не просачивается
    expect(outcome(OTHER_PHONE, '123456')).toBe('400:otp_expired');
    expect(outcome(free, '123456')).toBe('400:otp_expired');
    // верный код на занятый номер: теперь 409, номер прежний
    test.clock.advance(2 * 60_000);
    await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: OTHER_PHONE },
      headers: WRITE,
    });
    const code = codeFromSms(test.sms, OTHER_PHONE);
    expect(outcome(OTHER_PHONE, code)).toBe('409:phone_taken');
    expect(api.getUser(id)!.phone).toBe(PHONE);
  });

  it('удаление аккаунта стирает телефон и закрывает сессии, строка пользователя и согласия остаются', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    await grant(test, cookie, [{ kind: 'health_data', granted: true }]);
    const api = authFor(test.app.deps);
    const id = userId(test.app, PHONE);
    api.anonymizeUser(id);
    const me = await test.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: as(cookie),
    });
    expect(me.json()).toEqual({ user: null });
    const row = test.app.deps.db.get<{ phone: string | null; deleted_at: string | null }>(
      'SELECT phone, deleted_at FROM users WHERE id = ?',
      [id],
    )!;
    expect(row.phone).toBeNull();
    expect(row.deleted_at).not.toBeNull();
    expect(test.app.deps.db.query('SELECT 1 FROM consents')).toHaveLength(1);
    // тем же номером можно зарегистрироваться заново — это новый пользователь
    test.clock.advance(2 * 60_000);
    const again = await login(test);
    expect(again).toBeTruthy();
    expect(userId(test.app, PHONE)).not.toBe(id);
  });
});
