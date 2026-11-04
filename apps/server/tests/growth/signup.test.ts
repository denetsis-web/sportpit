// Источник регистрации: вход по коду создаёт строку signup_attribution и событие signup только для НОВОГО пользователя.
import { describe, expect, it } from 'vitest';
import {
  ANON_A,
  attribution,
  codeFromSms,
  countRows,
  eventsOf,
  makeApp,
  OTHER_PHONE,
  PHONE,
  post,
  requestCode,
  signUp,
  userId,
  verifyCode,
  type TestApp,
} from './helpers.ts';

interface AttributionRow {
  user_id: number;
  source: string;
  ref: string | null;
  campaign: string | null;
  anon_id: string | null;
  created_at: string;
}

const rows = (test: TestApp) =>
  test.app.deps.db.query<AttributionRow>('SELECT * FROM signup_attribution ORDER BY user_id');

describe('POST /auth/otp/verify с attribution', () => {
  it('новый пользователь: строка signup_attribution и событие signup, ответ API прежний', async () => {
    const test = await makeApp();
    await requestCode(test, PHONE);
    const res = await verifyCode(test, PHONE, codeFromSms(test.sms, PHONE), {
      lang: 'ro',
      attribution: attribution({ source: 'trainer', ref: 'ion', campaign: 'nov', anonId: ANON_A }),
    });
    expect(res.statusCode).toBe(200);
    const id = userId(test.app, PHONE);
    expect(res.json()).toEqual({
      user: { id, phone: PHONE, role: 'client', lang: 'ro', fridgeIds: [] },
    });
    expect(rows(test)).toEqual([
      {
        user_id: id,
        source: 'trainer',
        ref: 'ion',
        campaign: 'nov',
        anon_id: ANON_A,
        created_at: '2026-03-10T09:00:00.000Z',
      },
    ]);
    expect(eventsOf(test, 'signup')).toEqual([
      { kind: 'signup', source: 'trainer', ref: 'ion', campaign: 'nov', anon_id: ANON_A },
    ]);
  });

  it('без attribution пишется источник direct', async () => {
    const test = await makeApp();
    const { id } = await signUp(test, PHONE, 'omit');
    expect(rows(test)).toMatchObject([
      { user_id: id, source: 'direct', ref: null, campaign: null, anon_id: null },
    ]);
    expect(eventsOf(test, 'signup')).toMatchObject([{ source: 'direct', anon_id: null }]);
  });

  it('существующий пользователь: ничего не пишется, прежний источник не меняется', async () => {
    const test = await makeApp();
    await signUp(test, PHONE, attribution({ source: 'tg' }));
    test.clock.advance(5 * 60_000); // повторный код на тот же номер — не раньше чем через минуту
    await signUp(test, PHONE, attribution({ source: 'ig', anonId: ANON_A }));
    expect(rows(test)).toMatchObject([{ source: 'tg', anon_id: null }]);
    expect(eventsOf(test, 'signup')).toHaveLength(1);
    expect(countRows(test, 'users')).toBe(1);
  });

  it('испорченная attribution не мешает войти: пользователь создан, источник direct', async () => {
    const test = await makeApp();
    await requestCode(test, PHONE);
    const res = await verifyCode(test, PHONE, codeFromSms(test.sms, PHONE), {
      attribution: { source: 'myspace', ref: 'Плохая Метка', anonId: 42 },
    });
    expect(res.statusCode).toBe(200);
    expect(rows(test)).toMatchObject([{ source: 'direct', ref: null, anon_id: null }]);
  });

  it('неверный код: пользователь и источник не создаются', async () => {
    const test = await makeApp();
    await requestCode(test, PHONE);
    const res = await verifyCode(test, PHONE, '000000', { attribution: attribution() });
    expect(res.statusCode).toBe(400);
    expect(countRows(test, 'users')).toBe(0);
    expect(countRows(test, 'signup_attribution')).toBe(0);
    expect(countRows(test, 'funnel_events')).toBe(0);
  });
});

describe('удаление аккаунта', () => {
  it('стирает источник регистрации и анонимный номер пользователя, чужой не трогает', async () => {
    const test = await makeApp();
    const mine = await signUp(test, PHONE, attribution({ anonId: ANON_A }));
    const other = await signUp(test, OTHER_PHONE, attribution({ source: 'ig' }));
    expect(rows(test)).toHaveLength(2);

    const res = await post(
      test,
      '/profile/account/delete',
      { confirm: true },
      { cookie: mine.cookie },
    );
    expect(res.statusCode).toBe(200);
    expect(rows(test)).toMatchObject([{ user_id: other.id, source: 'ig' }]);
    // анонимный номер удалённого пользователя больше не связан ни с одной строкой регистрации
    expect(
      test.app.deps.db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM signup_attribution WHERE anon_id = ?',
        [ANON_A],
      )!.n,
    ).toBe(0);
  });
});

describe('миграция 101-growth', () => {
  it('создаёт три таблицы с индексами', async () => {
    const test = await makeApp();
    const names = (type: string) =>
      test.app.deps.db
        .query<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'`,
          [type],
        )
        .map((row) => row.name);
    expect(names('table')).toEqual(
      expect.arrayContaining(['waitlist_entries', 'funnel_events', 'signup_attribution']),
    );
    expect(names('index')).toEqual(
      expect.arrayContaining([
        'idx_waitlist_created',
        'idx_waitlist_anon',
        'idx_funnel_events_period',
        'idx_funnel_events_anon',
        'idx_signup_attribution_created',
        'idx_signup_attribution_anon',
      ]),
    );
    expect(
      test.app.deps.db.get<{ name: string }>(
        `SELECT name FROM schema_migrations WHERE name LIKE '101-%'`,
      )?.name,
    ).toBe('101-growth.sql');
  });
});
