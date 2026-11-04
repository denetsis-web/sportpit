// Стирание персональных данных листа ожидания и аналитики: удаление аккаунта и удаление записи администратором.
// Всё, что по анонимному номеру можно связать с человеком (запись листа, события воронки), уходит вместе с ним.
import { describe, expect, it } from 'vitest';
import {
  ANON_A,
  ANON_B,
  attribution,
  countRows,
  del,
  get,
  joinBody,
  makeAdminApp,
  phoneN,
  post,
  signUp,
  type TestApp,
} from './helpers.ts';

const ANON_C = 'c4d2e6f0-1a3b-4c5d-8e7f-9a0b1c2d3e44';

const track = (test: TestApp, kind: string, anonId: string, source = 'tg') =>
  post(test, '/track', { kind, attribution: attribution({ source, anonId }) });

const eventsFor = (test: TestApp, anonId: string): number =>
  test.app.deps.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM funnel_events WHERE anon_id = ?', [
    anonId,
  ])!.n;

const waitlistPhones = (test: TestApp): string[] =>
  test.app.deps.db
    .query<{ phone: string }>('SELECT phone FROM waitlist_entries ORDER BY id')
    .map((row) => row.phone);

describe('удаление аккаунта', () => {
  it('стирает запись листа по телефону и все события по анонимным номерам человека, чужое остаётся', async () => {
    const test = await makeAdminApp();
    const mine = phoneN(11);
    const other = phoneN(12);
    // Человек: смотрел и считал норму (номер A), записался в лист (тот же номер A) и зарегистрировался
    // с другого браузера (номер B) — события обоих номеров принадлежат ему.
    await track(test, 'landing_view', ANON_A);
    await track(test, 'calc_used', ANON_A);
    await post(
      test,
      '/waitlist',
      joinBody({ phone: mine, attribution: attribution({ anonId: ANON_A }) }),
      { ip: '10.3.0.1' },
    );
    await track(test, 'landing_view', ANON_B);
    const me = await signUp(test, mine, attribution({ anonId: ANON_B }));
    // Другой человек: свои события, запись листа и регистрация.
    await track(test, 'landing_view', ANON_C, 'ig');
    await post(
      test,
      '/waitlist',
      joinBody({ phone: other, attribution: attribution({ source: 'ig', anonId: ANON_C }) }),
      { ip: '10.3.0.2' },
    );
    await signUp(test, other, attribution({ source: 'ig', anonId: ANON_C }));
    expect(waitlistPhones(test)).toEqual([mine, other]);

    const res = await post(
      test,
      '/profile/account/delete',
      { confirm: true },
      { cookie: me.cookie },
    );
    expect(res.statusCode).toBe(200);

    expect(waitlistPhones(test)).toEqual([other]);
    expect(eventsFor(test, ANON_A)).toBe(0);
    expect(eventsFor(test, ANON_B)).toBe(0);
    expect(countRows(test, 'signup_attribution')).toBe(1);
    // Чужие данные не тронуты: просмотр, запись в лист и регистрация другого человека.
    expect(eventsFor(test, ANON_C)).toBe(2);
    // Ни одной строки аналитики, по которой выходят на удалённого: ни события, ни источника, ни записи листа.
    const db = test.app.deps.db;
    expect(
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM funnel_events WHERE anon_id IN (?, ?)', [
        ANON_A,
        ANON_B,
      ])!.n,
    ).toBe(0);
    expect(
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM signup_attribution WHERE user_id = ?', [
        me.id,
      ])!.n,
    ).toBe(0);
  });

  it('воронка и путь остальных не ломаются: считают оставшиеся события', async () => {
    const test = await makeAdminApp();
    await track(test, 'landing_view', ANON_A);
    await post(
      test,
      '/waitlist',
      joinBody({ phone: phoneN(11), attribution: attribution({ anonId: ANON_A }) }),
      { ip: '10.3.0.1' },
    );
    const me = await signUp(test, phoneN(11), attribution({ anonId: ANON_A }));
    await track(test, 'landing_view', ANON_C, 'ig');
    await post(
      test,
      '/waitlist',
      joinBody({ phone: phoneN(12), attribution: attribution({ source: 'ig', anonId: ANON_C }) }),
      { ip: '10.3.0.2' },
    );
    await post(test, '/profile/account/delete', { confirm: true }, { cookie: me.cookie });

    const funnel = await get(test, '/admin/funnel', { cookie: test.admin });
    expect(funnel.statusCode).toBe(200);
    const total = funnel.json().rows.find((row: { source: string }) => row.source === 'total');
    expect(total).toMatchObject({
      landingViews: 1,
      waitlistJoins: 1,
      signups: 0,
      unique: { visitors: 1, waitlist: 1 },
    });
    const list = await get(test, '/admin/waitlist', { cookie: test.admin });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toMatchObject([
      { phone: phoneN(12), path: { usedCalc: false, signedUp: false, purchased: false } },
    ]);
  });
});

describe('DELETE /admin/waitlist/:id', () => {
  it('стирает и события воронки с анонимным номером этой записи, чужие события остаются', async () => {
    const test = await makeAdminApp();
    await track(test, 'landing_view', ANON_A);
    await track(test, 'calc_used', ANON_A);
    await post(
      test,
      '/waitlist',
      joinBody({ phone: phoneN(11), attribution: attribution({ anonId: ANON_A }) }),
      { ip: '10.3.0.1' },
    );
    await track(test, 'landing_view', ANON_C, 'ig');
    await post(
      test,
      '/waitlist',
      joinBody({ phone: phoneN(12), attribution: attribution({ source: 'ig', anonId: ANON_C }) }),
      { ip: '10.3.0.2' },
    );
    // Запись без анонимного номера: удаление не должно снести события без номера.
    await post(test, '/track', {
      kind: 'landing_view',
      attribution: attribution({ source: 'gym' }),
    });
    await post(test, '/waitlist', joinBody({ phone: phoneN(13) }), { ip: '10.3.0.3' });
    expect(eventsFor(test, ANON_A)).toBe(3);

    const list = (await get(test, '/admin/waitlist', { cookie: test.admin })).json();
    const idOf = (phone: string) =>
      list.items.find((item: { phone: string }) => item.phone === phone).id as number;

    expect(
      (await del(test, `/admin/waitlist/${idOf(phoneN(11))}`, { cookie: test.admin })).statusCode,
    ).toBe(204);
    expect(eventsFor(test, ANON_A)).toBe(0);
    expect(eventsFor(test, ANON_C)).toBe(2);
    expect(countRows(test, 'funnel_events')).toBe(2 + 1 + 1);

    expect(
      (await del(test, `/admin/waitlist/${idOf(phoneN(13))}`, { cookie: test.admin })).statusCode,
    ).toBe(204);
    // событие без номера не связано с человеком и остаётся
    expect(countRows(test, 'funnel_events')).toBe(2 + 1 + 1);

    const funnel = (await get(test, '/admin/funnel', { cookie: test.admin })).json();
    expect(funnel.rows.find((row: { source: string }) => row.source === 'total')).toMatchObject({
      landingViews: 2,
      waitlistJoins: 2,
    });
  });
});
