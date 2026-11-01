// Отчёт «Выдано и списано»: приготовлено (кухня), выдано (заказы) и списано (выдача) с процентом списаний.
// Процент списаний = списано ÷ приготовлено × 100. Списания включают боксы без заказа (лишние в холодильнике).
import type { ReportRange, WasteReport } from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { catalogFor } from '../catalog/index.ts';
import { fulfillmentFor } from '../fulfillment/index.ts';
import { kitchenFor } from '../kitchen/index.ts';
import { datesOf, paginate, percentOf } from './range.ts';

interface Counter {
  cooked: number;
  delivered: number;
  writtenOff: number;
}

const counter = (): Counter => ({ cooked: 0, delivered: 0, writtenOff: 0 });

export function wasteReport(deps: AppDeps, range: ReportRange, page?: number): WasteReport {
  const cooked = kitchenFor(deps).cookedTotals(range.from, range.to);
  const writeOffs = fulfillmentFor(deps).writeOffTotals(range.from, range.to);
  const delivered = deps.db.query<{
    date: string;
    fridge_id: string;
    dish_id: number;
    qty: number;
  }>(
    `SELECT o.date, o.fridge_id, i.dish_id, SUM(i.qty) AS qty
       FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.status = 'picked_up' AND o.date BETWEEN ? AND ?
      GROUP BY o.date, o.fridge_id, i.dish_id`,
    [range.from, range.to],
  );

  const byDish = new Map<number | null, Counter>();
  const byFridge = new Map<string | null, Counter>();
  const byReason = new Map<string, number>();
  const daily = new Map<string, { date: string; delivered: number; writtenOff: number }>(
    datesOf(range).map((date) => [date, { date, delivered: 0, writtenOff: 0 }]),
  );
  const total = counter();
  const at = <K>(map: Map<K, Counter>, key: K): Counter => {
    let entry = map.get(key);
    if (!entry) {
      entry = counter();
      map.set(key, entry);
    }
    return entry;
  };

  for (const row of cooked) {
    for (const entry of [at(byDish, row.dishId), at(byFridge, row.fridgeId), total]) {
      entry.cooked += row.cooked;
    }
  }
  for (const row of delivered) {
    for (const entry of [at(byDish, row.dish_id), at(byFridge, row.fridge_id), total]) {
      entry.delivered += row.qty;
    }
    const day = daily.get(row.date);
    if (day) day.delivered += row.qty;
  }
  for (const row of writeOffs) {
    for (const entry of [at(byDish, row.dishId), at(byFridge, row.fridgeId), total]) {
      entry.writtenOff += row.qty;
    }
    byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + row.qty);
    const day = daily.get(row.date);
    if (day) day.writtenOff += row.qty;
  }

  const dishNames = new Map(
    catalogFor(deps)
      .listDishes()
      .map((d) => [d.id, d.name]),
  );
  const fridges = new Map(
    adminFor(deps)
      .listFridges()
      .map((f) => [f.id, f]),
  );

  const rows = [...byDish.entries()]
    .map(([dishId, c]) => ({
      dishId,
      name: dishId === null ? null : (dishNames.get(dishId) ?? null),
      ...c,
      wastePercent: percentOf(c.writtenOff, c.cooked),
    }))
    .sort(
      (a, b) =>
        b.writtenOff - a.writtenOff ||
        (a.dishId ?? Number.MAX_SAFE_INTEGER) - (b.dishId ?? Number.MAX_SAFE_INTEGER),
    );

  const fridgeRows = [...byFridge.entries()]
    .map(([fridgeId, c]) => {
      const fridge = fridgeId === null ? undefined : fridges.get(fridgeId);
      return {
        fridgeId,
        fridgeName: fridgeId === null ? null : (fridge?.name ?? fridgeId),
        gymName: fridge?.gymName ?? null,
        ...c,
        wastePercent: percentOf(c.writtenOff, c.cooked),
      };
    })
    .sort(
      (a, b) =>
        (a.fridgeId === null ? 1 : 0) - (b.fridgeId === null ? 1 : 0) ||
        (a.gymName ?? '').localeCompare(b.gymName ?? '', 'ru') ||
        (a.fridgeName ?? '').localeCompare(b.fridgeName ?? '', 'ru'),
    );

  const paged = paginate(rows, page);
  return {
    range,
    totals: { ...total, wastePercent: percentOf(total.writtenOff, total.cooked) },
    rows: paged.rows,
    byFridge: fridgeRows,
    byReason: [...byReason.entries()]
      .map(([reason, qty]) => ({
        reason: reason as WasteReport['byReason'][number]['reason'],
        qty,
      }))
      .sort((a, b) => b.qty - a.qty || a.reason.localeCompare(b.reason)),
    daily: [...daily.values()],
    page: paged.page,
  };
}
