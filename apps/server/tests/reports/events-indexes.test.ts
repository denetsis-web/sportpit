import { describe, expect, it } from 'vitest';
import { requestCode } from '../auth/helpers.ts';
import { buy } from '../billing/helpers.ts';
import { call, makeFulfillmentApp, type FulfillmentTest } from '../fulfillment/helpers.ts';
import { paginate } from '../../src/modules/reports/index.ts';

const events = (test: FulfillmentTest, query = '', cookie: string | null = test.admin) =>
  test.app.inject({
    method: 'GET',
    url: `/api/v1/admin/system/events${query}`,
    ...(cookie === null ? {} : { headers: { cookie } }),
  });

async function failSms(test: FulfillmentTest, times: number) {
  for (let i = 0; i < times; i += 1) {
    test.sms.failNext();
    expect((await requestCode(test, '+37369555000')).statusCode).toBe(502);
  }
}

describe('страница «События системы» (R57)', () => {
  it('сбои SMS и оплаты: счётчики за 24 часа и журнал, телефон замаскирован', async () => {
    const test = await makeFulfillmentApp();
    await failSms(test, 2);
    test.stub.failNext();
    const bought = await buy(test, test.client, 12);
    expect(bought.body.purchase.status).toBe('failed');

    const res = await events(test);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts24h).toEqual({ payment_failed: 1, sms_failed: 2 });
    expect(body.alertKinds).toEqual(['sms_failed', 'payment_failed']);
    expect(body.alertThreshold).toBe(3);
    expect(body.items.map((e: { kind: string }) => e.kind)).toEqual([
      'payment_failed',
      'sms_failed',
      'sms_failed',
    ]);
    expect(body.items[0].detail).toMatchObject({ operation: 'createPayment' });
    expect(JSON.stringify(body.items)).not.toContain('+37369555000');
    expect(body.page).toEqual({ number: 1, size: 50, total: 3, pages: 1 });
  });

  it('три сбоя SMS за час: страница показывает счётчик, администратору приходит system_alert', async () => {
    const test = await makeFulfillmentApp();
    await failSms(test, 2);
    const quiet = await call(test, 'GET', '/notifications', test.admin);
    expect(quiet.json().items.filter((n: { type: string }) => n.type === 'system_alert')).toEqual(
      [],
    );

    await failSms(test, 1);
    expect((await events(test)).json().counts24h.sms_failed).toBe(3);
    const bell = (await call(test, 'GET', '/notifications', test.admin)).json();
    const alerts = bell.items.filter((n: { type: string }) => n.type === 'system_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload).toEqual({ kind: 'sms_failed', count: 3 });
    // клиент уведомления не получает
    const mine = (await call(test, 'GET', '/notifications', test.client)).json();
    expect(mine.items.filter((n: { type: string }) => n.type === 'system_alert')).toEqual([]);
  });

  it('счётчики считают последние 24 часа, а журнал хранит и старое', async () => {
    const test = await makeFulfillmentApp();
    await failSms(test, 1);
    test.clock.advance(25 * 60 * 60 * 1000);
    const body = (await events(test)).json();
    expect(body.counts24h).toEqual({});
    expect(body.items).toHaveLength(1);
  });

  it('журнал по 50 строк, новые первыми; фильтр по виду события', async () => {
    const test = await makeFulfillmentApp();
    for (let i = 0; i < 120; i += 1) test.deps.system.logEvent('job_failed', { n: i });
    test.deps.system.logEvent('server_error', { n: 999 });
    const first = (await events(test)).json();
    expect(first.items).toHaveLength(50);
    expect(first.items[0].kind).toBe('server_error');
    expect(first.page).toEqual({ number: 1, size: 50, total: 121, pages: 3 });
    const last = (await events(test, '?page=3')).json();
    expect(last.items).toHaveLength(21);
    const jobs = (await events(test, '?kind=job_failed&page=3')).json();
    expect(jobs.items).toHaveLength(20);
    expect(jobs.page.total).toBe(120);
    expect(new Set(jobs.items.map((e: { kind: string }) => e.kind))).toEqual(
      new Set(['job_failed']),
    );
    expect((await events(test, '?kind=Bad%20Kind')).statusCode).toBe(400);
    expect((await events(test, '?page=0')).statusCode).toBe(400);
  });

  it('пропущенные замеры температуры: число совпадает со списком раздела «Температура»', async () => {
    const test = await makeFulfillmentApp();
    test.clock.set('2026-03-14T20:00:00Z');
    const missed = (await call(test, 'GET', '/admin/temperature/missed', test.admin)).json();
    expect(missed.items.length).toBeGreaterThan(0);
    expect((await events(test)).json().missedTemperature).toBe(missed.items.length);
  });

  it('только администратор: гость 401, клиент, кухня и оператор 403', async () => {
    const test = await makeFulfillmentApp();
    expect((await events(test, '', null)).statusCode).toBe(401);
    for (const cookie of [test.client, test.kitchen, test.operator]) {
      expect((await events(test, '', cookie)).statusCode).toBe(403);
    }
  });
});

describe('постраничный вывод и индексы (R37.2)', () => {
  it('по 50 строк: страницы, последняя неполная, за пределами пусто, без номера — всё', () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(paginate(rows, 1).rows).toHaveLength(50);
    expect(paginate(rows, 3).rows).toEqual(rows.slice(100));
    expect(paginate(rows, 3).page).toEqual({ number: 3, size: 50, total: 120, pages: 3 });
    expect(paginate(rows, 4).rows).toEqual([]);
    expect(paginate([], 1).page).toEqual({ number: 1, size: 50, total: 0, pages: 1 });
    expect(paginate(rows).rows).toHaveLength(120);
  });

  it('выданные заказы за период читаются по индексу со статусом, датой, холодильником и клиентом', async () => {
    const test = await makeFulfillmentApp();
    const db = test.deps.db;
    const columns = db
      .query<{ name: string }>("PRAGMA index_info('idx_orders_report')")
      .map((c) => c.name);
    expect(columns).toEqual(['status', 'date', 'fridge_id', 'user_id']);
    const plan = db
      .query<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT user_id, fridge_id FROM orders
          WHERE status = 'picked_up' AND date BETWEEN '2026-03-01' AND '2026-03-31'`,
      )
      .map((r) => r.detail)
      .join(' ');
    expect(plan).toContain('idx_orders_report');
    expect(plan).not.toContain('SCAN orders');
  });

  it('оценки за период читаются по индексу даты', async () => {
    const test = await makeFulfillmentApp();
    const plan = test.deps.db
      .query<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT dish_id, COUNT(*) FROM dish_ratings
          WHERE created_at >= '2026-03-01' AND created_at < '2026-04-01' GROUP BY dish_id`,
      )
      .map((r) => r.detail)
      .join(' ');
    expect(plan).toContain('idx_dish_ratings_created');
  });
});
