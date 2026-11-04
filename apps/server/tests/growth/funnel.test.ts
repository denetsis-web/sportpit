// Воронка по источникам: события, регистрации, первые покупки, уникальные люди, период.
import { describe, expect, it } from 'vitest';
import {
  addPaidPurchase,
  ANON_A,
  ANON_B,
  attribution,
  DAY,
  get,
  joinBody,
  makeAdminApp,
  phoneN,
  post,
  signUp,
  type TestApp,
} from './helpers.ts';

interface Row {
  source: string;
  landingViews: number;
  calcUsed: number;
  waitlistJoins: number;
  signups: number;
  firstPurchases: number;
  unique: { visitors: number; calc: number; waitlist: number; signups: number; purchases: number };
}
interface Report {
  from: string;
  to: string;
  rows: Row[];
}

const SOURCES = ['gym', 'trainer', 'tg', 'ig', 'direct', 'other', 'total'];

const funnel = async (test: TestApp & { admin: string }, query = ''): Promise<Report> => {
  const res = await get(test, `/admin/funnel${query}`, { cookie: test.admin });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
};
const rowOf = (report: Report, source: string): Row =>
  report.rows.find((row) => row.source === source)!;

const track = (test: TestApp, kind: string, attr: Record<string, unknown>, n = 1) =>
  Promise.all(Array.from({ length: n }, () => post(test, '/track', { kind, attribution: attr })));

describe('GET /admin/funnel', () => {
  it('без событий — все источники и «всего» с нулями, период по умолчанию 30 дней', async () => {
    const test = await makeAdminApp();
    const report = await funnel(test);
    expect(report.from).toBe('2026-02-09');
    expect(report.to).toBe('2026-03-10');
    expect(report.rows.map((row) => row.source)).toEqual(SOURCES);
    for (const row of report.rows) {
      expect(row).toEqual({
        source: row.source,
        landingViews: 0,
        calcUsed: 0,
        waitlistJoins: 0,
        signups: 0,
        firstPurchases: 0,
        unique: { visitors: 0, calc: 0, waitlist: 0, signups: 0, purchases: 0 },
      });
    }
  });

  it('считает этапы по источникам и в итоге; уникальные — по разным анонимным номерам', async () => {
    const test = await makeAdminApp();
    // Telegram: 3 просмотра двух людей и одного без номера, один человек считал норму дважды
    await track(test, 'landing_view', attribution({ source: 'tg', anonId: ANON_A }), 2);
    await track(test, 'landing_view', attribution({ source: 'tg', anonId: ANON_B }));
    await track(test, 'landing_view', attribution({ source: 'tg' }));
    await track(test, 'calc_used', attribution({ source: 'tg', anonId: ANON_A }), 2);
    // Instagram: один просмотр без номера
    await track(test, 'landing_view', attribution({ source: 'ig' }));
    // Лист ожидания: одна запись из Telegram с номером, одна из зала без номера
    await post(
      test,
      '/waitlist',
      joinBody({ phone: phoneN(1), attribution: attribution({ source: 'tg', anonId: ANON_A }) }),
      { ip: '10.2.0.1' },
    );
    await post(
      test,
      '/waitlist',
      joinBody({ phone: phoneN(2), attribution: attribution({ source: 'gym' }) }),
      { ip: '10.2.0.2' },
    );
    // Регистрация: Telegram с номером и прямой заход
    await signUp(test, phoneN(901), attribution({ source: 'tg', anonId: ANON_A }));
    await signUp(test, phoneN(902), 'omit');

    const report = await funnel(test);
    expect(rowOf(report, 'tg')).toEqual({
      source: 'tg',
      landingViews: 4,
      calcUsed: 2,
      waitlistJoins: 1,
      signups: 1,
      firstPurchases: 0,
      unique: { visitors: 2, calc: 1, waitlist: 1, signups: 1, purchases: 0 },
    });
    expect(rowOf(report, 'ig')).toMatchObject({ landingViews: 1, unique: { visitors: 0 } });
    expect(rowOf(report, 'gym')).toMatchObject({ waitlistJoins: 1, unique: { waitlist: 0 } });
    expect(rowOf(report, 'direct')).toMatchObject({ signups: 1 });
    // «Всего»: тот же человек в разных источниках считается один раз
    expect(rowOf(report, 'total')).toEqual({
      source: 'total',
      landingViews: 5,
      calcUsed: 2,
      waitlistJoins: 2,
      signups: 2,
      firstPurchases: 0,
      unique: { visitors: 2, calc: 1, waitlist: 1, signups: 1, purchases: 0 },
    });
  });

  it('первая покупка — MIN(paid_at) пользователя, с источником из регистрации (нет строки — direct)', async () => {
    const test = await makeAdminApp();
    const fromTg = await signUp(test, phoneN(901), attribution({ source: 'tg', anonId: ANON_A }));
    // две оплаты одного человека: считается одна, в день первой
    addPaidPurchase(test, fromTg.id, '2026-03-02T10:00:00.000Z');
    addPaidPurchase(test, fromTg.id, '2026-03-09T10:00:00.000Z');
    // администратор создан командой, без источника регистрации
    const adminId = (await get(test, '/auth/me', { cookie: test.admin })).json().user.id as number;
    addPaidPurchase(test, adminId, '2026-03-05T10:00:00.000Z');

    const report = await funnel(test);
    expect(rowOf(report, 'tg')).toMatchObject({ firstPurchases: 1, unique: { purchases: 1 } });
    expect(rowOf(report, 'direct')).toMatchObject({ firstPurchases: 1, unique: { purchases: 0 } });
    expect(rowOf(report, 'total')).toMatchObject({ firstPurchases: 2, unique: { purchases: 1 } });

    // период, в который попала только вторая оплата tg-пользователя: это не его первая покупка
    const late = await funnel(test, '?from=2026-03-08&to=2026-03-10');
    expect(rowOf(late, 'total').firstPurchases).toBe(0);
    const early = await funnel(test, '?from=2026-03-01&to=2026-03-04');
    expect(rowOf(early, 'tg').firstPurchases).toBe(1);
    expect(rowOf(early, 'direct').firstPurchases).toBe(0);
  });

  it('неоплаченные покупки не считаются', async () => {
    const test = await makeAdminApp();
    const user = await signUp(test, phoneN(901), attribution({ source: 'tg' }));
    test.app.deps.db.run(
      `INSERT INTO purchases (user_id, package_id, boxes, validity_days, list_price_per_box_bani,
         unit_price_bani, total_bani, method, status, idempotency_key, created_at, updated_at)
       VALUES (?, 1, 12, 45, 11900, 11900, 142800, 'card', 'pending', 'k-pending', 'x', 'x')`,
      [user.id],
    );
    expect(rowOf(await funnel(test), 'total').firstPurchases).toBe(0);
  });

  it('период: события вне него не попадают, границы — дни по Кишинёву включительно', async () => {
    const test = await makeAdminApp();
    await track(test, 'landing_view', attribution({ source: 'tg' })); // 2026-03-10
    test.clock.advance(DAY);
    await track(test, 'landing_view', attribution({ source: 'tg' }), 2); // 2026-03-11
    test.clock.advance(DAY);
    await track(test, 'landing_view', attribution({ source: 'tg' }), 4); // 2026-03-12

    const views = async (query: string) => rowOf(await funnel(test, query), 'total').landingViews;
    expect(await views('?from=2026-03-10&to=2026-03-12')).toBe(7);
    expect(await views('?from=2026-03-11&to=2026-03-11')).toBe(2);
    expect(await views('?to=2026-03-10')).toBe(1);
    expect(await views('?from=2026-03-13&to=2026-03-14')).toBe(0);
    const reversed = await get(test, '/admin/funnel?from=2026-03-12&to=2026-03-10', {
      cookie: test.admin,
    });
    expect(reversed.statusCode).toBe(400);
    const bad = await get(test, '/admin/funnel?from=вчера', { cookie: test.admin });
    expect(bad.statusCode).toBe(400);
  });
});
