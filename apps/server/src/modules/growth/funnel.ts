// Воронка по источникам: просмотры → расчёт нормы → запись в лист → регистрация → первая покупка.
// Просмотры, расчёты и записи — события funnel_events. Регистрации — строки signup_attribution.
// Первая покупка — MIN(paid_at) оплаченных покупок пользователя; источник берётся из его signup_attribution
// (нет строки, например пользователь создан до этой функции или командой, — `direct`).
// `unique` — число разных анонимных номеров на этапе; без согласия на аналитику номера нет, и человек в него не попадает.
import {
  ATTRIBUTION_SOURCES,
  type AttributionSource,
  type FunnelReport,
  type FunnelRow,
} from '@sportpit/shared/schemas/growth';
import { addDaysISO, localToUtc } from '@sportpit/shared/time';
import type { Db } from '../db/index.ts';

interface Period {
  from: string;
  to: string;
}

interface Counts {
  n: number;
  u: number;
}

const ZERO: Counts = { n: 0, u: 0 };

type Stage = 'landing_view' | 'calc_used' | 'waitlist_join' | 'signup' | 'purchase';
type Table = Map<string, Counts>;

const key = (stage: Stage, source: AttributionSource | 'total') => `${stage}:${source}`;

export function funnelReport(db: Db, period: Period): FunnelReport {
  // Границы периода — дни по Кишинёву, обе включительно; в базе время в UTC одного формата.
  const start = localToUtc(period.from, '00:00').toISOString();
  const end = localToUtc(addDaysISO(period.to, 1), '00:00').toISOString();
  const table: Table = new Map();
  const put = (stage: Stage, source: AttributionSource | 'total', counts: Counts) =>
    table.set(key(stage, source), counts);

  for (const stage of ['landing_view', 'calc_used', 'waitlist_join'] as const) {
    const bySource = db.query<{ source: AttributionSource } & Counts>(
      `SELECT source, COUNT(*) AS n, COUNT(DISTINCT anon_id) AS u
         FROM funnel_events WHERE kind = ? AND created_at >= ? AND created_at < ? GROUP BY source`,
      [stage, start, end],
    );
    for (const row of bySource) put(stage, row.source, row);
    const total = db.get<Counts>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT anon_id) AS u
         FROM funnel_events WHERE kind = ? AND created_at >= ? AND created_at < ?`,
      [stage, start, end],
    )!;
    put(stage, 'total', total);
  }

  const signups = db.query<{ source: AttributionSource } & Counts>(
    `SELECT source, COUNT(*) AS n, COUNT(DISTINCT anon_id) AS u
       FROM signup_attribution WHERE created_at >= ? AND created_at < ? GROUP BY source`,
    [start, end],
  );
  for (const row of signups) put('signup', row.source, row);
  put(
    'signup',
    'total',
    db.get<Counts>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT anon_id) AS u
         FROM signup_attribution WHERE created_at >= ? AND created_at < ?`,
      [start, end],
    )!,
  );

  // Первая покупка: у пользователя считается один раз, в периоде своей первой оплаты.
  const firstPurchases = `
    FROM (SELECT user_id, MIN(paid_at) AS first_paid FROM purchases
           WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY user_id) f
    LEFT JOIN signup_attribution s ON s.user_id = f.user_id
    WHERE f.first_paid >= ? AND f.first_paid < ?`;
  const purchases = db.query<{ source: AttributionSource } & Counts>(
    `SELECT COALESCE(s.source, 'direct') AS source, COUNT(*) AS n, COUNT(DISTINCT s.anon_id) AS u
       ${firstPurchases} GROUP BY COALESCE(s.source, 'direct')`,
    [start, end],
  );
  for (const row of purchases) put('purchase', row.source, row);
  put(
    'purchase',
    'total',
    db.get<Counts>(`SELECT COUNT(*) AS n, COUNT(DISTINCT s.anon_id) AS u ${firstPurchases}`, [
      start,
      end,
    ])!,
  );

  const at = (stage: Stage, source: AttributionSource | 'total') =>
    table.get(key(stage, source)) ?? ZERO;
  const rowOf = (source: AttributionSource | 'total'): FunnelRow => ({
    source,
    landingViews: at('landing_view', source).n,
    calcUsed: at('calc_used', source).n,
    waitlistJoins: at('waitlist_join', source).n,
    signups: at('signup', source).n,
    firstPurchases: at('purchase', source).n,
    unique: {
      visitors: at('landing_view', source).u,
      calc: at('calc_used', source).u,
      waitlist: at('waitlist_join', source).u,
      signups: at('signup', source).u,
      purchases: at('purchase', source).u,
    },
  });

  return {
    from: period.from,
    to: period.to,
    rows: [...ATTRIBUTION_SOURCES, 'total' as const].map(rowOf),
  };
}
