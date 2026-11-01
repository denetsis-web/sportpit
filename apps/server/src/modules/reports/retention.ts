// Отчёт «Активные клиенты и отток». Активный клиент — тот, у кого за период выдан хотя бы один заказ.
// Отток — клиент, бравший боксы в предыдущем периоде той же длины и не бравший в текущем.
import type { ReportRange, RetentionReport } from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { paginate, percentOf, previousRange } from './range.ts';

/** Клиенты, получившие боксы за период: всего и по залам. */
function takers(deps: AppDeps, range: ReportRange) {
  const all = new Set<number>();
  const byGym = new Map<string, Set<number>>();
  for (const row of deps.db.query<{ user_id: number; gym_id: string }>(
    `SELECT DISTINCT o.user_id, f.gym_id
       FROM orders o JOIN fridges f ON f.id = o.fridge_id
      WHERE o.status = 'picked_up' AND o.date BETWEEN ? AND ?`,
    [range.from, range.to],
  )) {
    all.add(row.user_id);
    let set = byGym.get(row.gym_id);
    if (!set) {
      set = new Set();
      byGym.set(row.gym_id, set);
    }
    set.add(row.user_id);
  }
  return { all, byGym };
}

const countMissing = (from: ReadonlySet<number>, other: ReadonlySet<number>): number => {
  let n = 0;
  for (const id of from) if (!other.has(id)) n += 1;
  return n;
};

export function retentionReport(deps: AppDeps, range: ReportRange, page?: number): RetentionReport {
  const previous = previousRange(range);
  const now = takers(deps, range);
  const before = takers(deps, previous);

  const churned = countMissing(before.all, now.all);
  const fresh = countMissing(now.all, before.all);
  const none = new Set<number>();
  const rows = adminFor(deps)
    .listGyms()
    .map((gym) => {
      const current = now.byGym.get(gym.id) ?? none;
      const earlier = before.byGym.get(gym.id) ?? none;
      return {
        gym,
        active: current.size,
        previousActive: earlier.size,
        churned: countMissing(earlier, current),
      };
    })
    .filter((r) => r.gym.active || r.active > 0 || r.previousActive > 0)
    .map(({ gym, ...rest }) => ({ gymId: gym.id, gymName: gym.name, ...rest }))
    .sort((a, b) => a.gymName.localeCompare(b.gymName, 'ru') || a.gymId.localeCompare(b.gymId));

  const paged = paginate(rows, page);
  return {
    range,
    previous,
    totals: {
      active: now.all.size,
      previousActive: before.all.size,
      retained: now.all.size - fresh,
      fresh,
      churned,
      churnPercent: percentOf(churned, before.all.size),
    },
    rows: paged.rows,
    page: paged.page,
  };
}
