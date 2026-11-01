// Отчёт «Продажи»: выданные боксы и выручка по залам и пакетам, проданные пакеты, график по дням.
import type { ReportRange, SalesReport } from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { loadDelivered, type DeliveredOrder } from './delivered.ts';
import { datesOf, paginate, utcBounds } from './range.ts';

export interface GymTotals {
  boxes: number;
  revenueBani: number;
}

/** Выдано и выручка по залам: основа и для продаж, и для доли зала. */
export function totalsByGym(delivered: readonly DeliveredOrder[]): Map<string, GymTotals> {
  const out = new Map<string, GymTotals>();
  for (const order of delivered) {
    const entry = out.get(order.gymId) ?? { boxes: 0, revenueBani: 0 };
    for (const line of order.lines) {
      entry.boxes += line.boxes;
      entry.revenueBani += line.revenueBani;
    }
    out.set(order.gymId, entry);
  }
  return out;
}

export function salesReport(
  deps: AppDeps,
  range: ReportRange,
  page?: number,
  delivered: readonly DeliveredOrder[] = loadDelivered(deps, range.from, range.to),
): SalesReport {
  const gymNames = new Map(
    adminFor(deps)
      .listGyms()
      .map((g) => [g.id, g.name]),
  );

  const grouped = new Map<string, SalesReport['rows'][number]>();
  const daily = new Map<string, { date: string; boxes: number; revenueBani: number }>(
    datesOf(range).map((date) => [date, { date, boxes: 0, revenueBani: 0 }]),
  );
  const totals = { orders: delivered.length, boxes: 0, revenueBani: 0 };
  for (const order of delivered) {
    for (const line of order.lines) {
      const key = `${order.gymId}|${line.packageBoxes ?? ''}`;
      const row = grouped.get(key) ?? {
        gymId: order.gymId,
        gymName: gymNames.get(order.gymId) ?? order.gymId,
        packageBoxes: line.packageBoxes,
        boxes: 0,
        revenueBani: 0,
      };
      row.boxes += line.boxes;
      row.revenueBani += line.revenueBani;
      grouped.set(key, row);
      totals.boxes += line.boxes;
      totals.revenueBani += line.revenueBani;
      const day = daily.get(order.date);
      if (day) {
        day.boxes += line.boxes;
        day.revenueBani += line.revenueBani;
      }
    }
  }
  const rows = [...grouped.values()].sort(
    (a, b) =>
      a.gymName.localeCompare(b.gymName, 'ru') ||
      a.gymId.localeCompare(b.gymId) ||
      (a.packageBoxes ?? Number.MAX_SAFE_INTEGER) - (b.packageBoxes ?? Number.MAX_SAFE_INTEGER),
  );

  const { start, end } = utcBounds(range);
  const purchases = deps.db
    .query<{ boxes: number; n: number; total: number }>(
      `SELECT boxes, COUNT(*) AS n, SUM(total_bani) AS total FROM purchases
        WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?
        GROUP BY boxes ORDER BY boxes`,
      [start, end],
    )
    .map((r) => ({ packageBoxes: r.boxes, count: r.n, totalBani: r.total }));

  const paged = paginate(rows, page);
  return {
    range,
    totals,
    rows: paged.rows,
    purchases,
    daily: [...daily.values()],
    page: paged.page,
  };
}
