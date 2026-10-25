import { describe, expect, it } from 'vitest';
import { notificationsFor } from '../../src/modules/notifications/index.ts';
import {
  as,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  requestCode,
  setRole,
  userId,
  WRITE,
  type TestApp,
} from '../auth/helpers.ts';

const THIRD_PHONE = '+37379000111';
const MINUTE = 60_000;

const list = (test: TestApp, cookie?: string, query = '') =>
  test.app.inject({
    method: 'GET',
    url: `/api/v1/notifications${query}`,
    headers: cookie ? as(cookie) : {},
  });
const post = (test: TestApp, url: string, cookie: string) =>
  test.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: as(cookie, WRITE) });

async function userWithCookie(test: TestApp, phone = PHONE) {
  const cookie = await login(test, phone);
  test.clock.advance(2 * MINUTE);
  return { cookie, id: userId(test.app, phone) };
}

describe('колокольчик: notify, список, отметка прочитанным', () => {
  it('notify создаёт уведомление, список показывает непрочитанные, новые сверху', async () => {
    const test = await makeApp();
    const { cookie, id } = await userWithCookie(test);
    const api = notificationsFor(test.app.deps);
    api.notify(id, 'rate_dish', { orderId: 12, link: '/orders/12' });
    test.clock.advance(MINUTE);
    api.notify(id, 'credits_expiring', { count: 4 });

    const res = await list(test, cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unreadCount).toBe(2);
    expect(body.items.map((i: { type: string }) => i.type)).toEqual([
      'credits_expiring',
      'rate_dish',
    ]);
    expect(body.items[1]).toMatchObject({
      type: 'rate_dish',
      payload: { orderId: 12, link: '/orders/12' },
      readAt: null,
    });
    expect(body.items[0].createdAt).toBe('2026-03-10T09:03:00.000Z');
  });

  it('отметка прочитанным ставит время и уменьшает счётчик; повтор ничего не ломает', async () => {
    const test = await makeApp();
    const { cookie, id } = await userWithCookie(test);
    const api = notificationsFor(test.app.deps);
    const first = api.notify(id, 'rate_dish', {});
    api.notify(id, 'complaint_resolved', { complaintId: 5 });

    const read = await post(test, `/notifications/${first}/read`, cookie);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ marked: 1, unreadCount: 1 });
    const again = await post(test, `/notifications/${first}/read`, cookie);
    expect(again.json()).toEqual({ marked: 0, unreadCount: 1 });

    const after = (await list(test, cookie)).json();
    const item = after.items.find((i: { id: number }) => i.id === first);
    expect(item.readAt).toBe('2026-03-10T09:02:00.000Z');
    const unreadOnly = (await list(test, cookie, '?unread=1')).json();
    expect(unreadOnly.items).toHaveLength(1);
    expect(unreadOnly.items[0].type).toBe('complaint_resolved');
  });

  it('«прочитать все» отмечает все свои уведомления', async () => {
    const test = await makeApp();
    const { cookie, id } = await userWithCookie(test);
    const api = notificationsFor(test.app.deps);
    for (let i = 0; i < 3; i++) api.notify(id, 'rate_dish', {});
    const res = await post(test, '/notifications/read-all', cookie);
    expect(res.json()).toEqual({ marked: 3, unreadCount: 0 });
    expect((await list(test, cookie)).json().unreadCount).toBe(0);
  });

  it('чужие уведомления не видны и не отмечаются', async () => {
    const test = await makeApp();
    const mine = await userWithCookie(test, PHONE);
    const other = await userWithCookie(test, OTHER_PHONE);
    const api = notificationsFor(test.app.deps);
    const foreign = api.notify(other.id, 'rate_dish', {});
    expect((await list(test, mine.cookie)).json()).toEqual({ items: [], unreadCount: 0 });
    const res = await post(test, `/notifications/${foreign}/read`, mine.cookie);
    expect(res.statusCode).toBe(404);
    await post(test, '/notifications/read-all', mine.cookie);
    expect((await list(test, other.cookie)).json().unreadCount).toBe(1);
    // и на уровне сервиса: чужой номер уведомления не отмечается
    expect(api.markRead(mine.id, foreign)).toBe(0);
    expect(api.unreadCount(other.id)).toBe(1);
  });

  it('без входа — 401', async () => {
    const test = await makeApp();
    expect((await list(test)).statusCode).toBe(401);
    const res = await test.app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: WRITE,
    });
    expect(res.statusCode).toBe(401);
  });

  it('notify не принимает неизвестный тип, вложенные данные и несуществующего пользователя', async () => {
    const test = await makeApp();
    const { id } = await userWithCookie(test);
    const api = notificationsFor(test.app.deps);
    expect(() => api.notify(id, 'promo' as never, {})).toThrow();
    expect(() => api.notify(id, 'rate_dish', { nested: { a: 1 } } as never)).toThrow();
    expect(() => api.notify(9999, 'rate_dish', {})).toThrow();
    expect(test.app.deps.db.query('SELECT 1 FROM notifications')).toHaveLength(0);
  });
});

describe('системное уведомление при сбоях (R57.1)', () => {
  async function setup() {
    const test = await makeApp();
    const admin = await userWithCookie(test, PHONE);
    setRole(test.app, PHONE, 'admin');
    const admin2 = await userWithCookie(test, OTHER_PHONE);
    setRole(test.app, OTHER_PHONE, 'admin');
    const client = await userWithCookie(test, THIRD_PHONE);
    test.sms.clear();
    return { test, admin, admin2, client };
  }
  const alerts = (test: TestApp, userIdValue: number) =>
    test.app.deps.db.query<{ payload: string }>(
      "SELECT payload FROM notifications WHERE user_id = ? AND type = 'system_alert' ORDER BY id",
      [userIdValue],
    );

  it('3 сбоя SMS за час: каждый администратор получает один system_alert, клиент — нет', async () => {
    const { test, admin, admin2, client } = await setup();
    for (let i = 0; i < 3; i++) {
      test.sms.failNext();
      const res = await requestCode(test, '+37369555000');
      expect(res.statusCode).toBe(502);
    }
    expect(alerts(test, admin.id)).toHaveLength(1);
    expect(alerts(test, admin2.id)).toHaveLength(1);
    expect(alerts(test, client.id)).toHaveLength(0);
    expect(JSON.parse(alerts(test, admin.id)[0]!.payload)).toEqual({
      kind: 'sms_failed',
      count: 3,
    });
    // в колокольчике администратора уведомление видно
    const seen = (await list(test, admin.cookie)).json();
    expect(seen.items[0]).toMatchObject({ type: 'system_alert', readAt: null });
  });

  it('2 сбоя — тишина; четвёртый в том же часе второго уведомления не создаёт', async () => {
    const { test, admin } = await setup();
    test.app.deps.system.logEvent('sms_failed');
    test.app.deps.system.logEvent('sms_failed');
    expect(alerts(test, admin.id)).toHaveLength(0);
    test.app.deps.system.logEvent('sms_failed');
    test.app.deps.system.logEvent('sms_failed');
    expect(alerts(test, admin.id)).toHaveLength(1);
  });

  it('сбои, растянутые больше чем на час, не считаются; новая серия через час даёт новое уведомление', async () => {
    const { test, admin } = await setup();
    const log = () => test.app.deps.system.logEvent('payment_failed');
    log();
    test.clock.advance(40 * MINUTE);
    log();
    test.clock.advance(40 * MINUTE);
    log(); // первый уже старше часа
    expect(alerts(test, admin.id)).toHaveLength(0);
    log();
    log(); // третий и четвёртый попадают в окно вместе с предыдущим
    expect(alerts(test, admin.id)).toHaveLength(1);
    expect(JSON.parse(alerts(test, admin.id)[0]!.payload).kind).toBe('payment_failed');
    test.clock.advance(61 * MINUTE);
    log();
    log();
    log();
    expect(alerts(test, admin.id)).toHaveLength(2);
  });

  it('SMS и оплата считаются отдельно: по 2 сбоя каждого — тишина', async () => {
    const { test, admin } = await setup();
    for (const kind of ['sms_failed', 'payment_failed', 'sms_failed', 'payment_failed']) {
      test.app.deps.system.logEvent(kind);
    }
    expect(alerts(test, admin.id)).toHaveLength(0);
  });

  it('прочие события (ошибки сервера) уведомлений не вызывают', async () => {
    const { test, admin } = await setup();
    for (let i = 0; i < 5; i++) test.app.deps.system.logEvent('server_error');
    expect(alerts(test, admin.id)).toHaveLength(0);
  });
});
