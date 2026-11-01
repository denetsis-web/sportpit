// Выданные заказы за период с выручкой. Выручка бокса — цена кредита лота (billing.orderCredits):
// невыданные, отменённые и списанные заказы сюда не попадают, как и их кредиты.
import type { AppDeps } from '../../app.ts';
import { billingFor } from '../billing/index.ts';

export interface DeliveredLine {
  /** Размер пакета, из которого взяты кредиты; `null` — кредиты без пакета (промокод, замена по жалобе). */
  packageBoxes: number | null;
  boxes: number;
  revenueBani: number;
}

export interface DeliveredOrder {
  id: string;
  userId: number;
  fridgeId: string;
  gymId: string;
  date: string;
  boxes: number;
  lines: DeliveredLine[];
}

interface OrderRow {
  id: string;
  user_id: number;
  fridge_id: string;
  gym_id: string;
  date: string;
  boxes: number;
}

export function loadDelivered(deps: AppDeps, from: string, to: string): DeliveredOrder[] {
  const { db } = deps;
  const billing = billingFor(deps);
  const packageByLot = new Map<number, number | null>();
  const packageOf = (lotId: number): number | null => {
    if (packageByLot.has(lotId)) return packageByLot.get(lotId)!;
    const row = db.get<{ boxes: number | null }>(
      `SELECT p.boxes AS boxes FROM credit_lots l LEFT JOIN purchases p ON p.id = l.purchase_id
        WHERE l.id = ?`,
      [lotId],
    );
    const value = row?.boxes ?? null;
    packageByLot.set(lotId, value);
    return value;
  };

  const rows = db.query<OrderRow>(
    `SELECT o.id, o.user_id, o.fridge_id, f.gym_id, o.date, o.boxes
       FROM orders o JOIN fridges f ON f.id = o.fridge_id
      WHERE o.status = 'picked_up' AND o.date BETWEEN ? AND ?
      ORDER BY o.date, o.id`,
    [from, to],
  );
  return rows.map((row) => {
    const lines: DeliveredLine[] = billing.orderCredits(row.id).lots.map((lot) => ({
      packageBoxes: packageOf(lot.lotId),
      boxes: lot.credits,
      revenueBani: lot.credits * lot.unitPriceBani,
    }));
    const priced = lines.reduce((sum, line) => sum + line.boxes, 0);
    // боксы без записей в журнале кредитов (не должно быть) считаются выданными без выручки
    if (priced < row.boxes) {
      lines.push({ packageBoxes: null, boxes: row.boxes - priced, revenueBani: 0 });
    }
    return {
      id: row.id,
      userId: row.user_id,
      fridgeId: row.fridge_id,
      gymId: row.gym_id,
      date: row.date,
      boxes: row.boxes,
      lines,
    };
  });
}
