// Правила кухни: сводка производства, закрытие приёма заказов, партии, данные этикетки.
//
// Срок приёма заказов на дату D по холодильнику — cutoffTime холодильника в день D−1 (Clock.cutoffFor).
// Когда срок прошёл, порции холодильника на D фиксируются снимком (kitchen_closures/_items) и дальше
// не меняются, даже если заказ позже отменили (например, при удалении аккаунта). Фиксирует задача по
// расписанию, а если она не успела, — первое обращение к сводке: оба пути идут через `closeDue`.
// Когда закрыты все холодильники даты, создаются партии блюд (planned): порции заказов + запас на брак.
import type { Allergen } from '@sportpit/shared/schemas/catalog';
import {
  BATCH_TRANSITIONS,
  MAX_LABEL_COPIES,
  parseLabelSize,
  type BatchDto,
  type BatchStatus,
  type CookedTotalRow,
  type FridgeBatchDto,
  type LabelData,
  type ProductionSummary,
} from '@sportpit/shared/schemas/kitchen';
import { addDaysISO, isDateISO } from '@sportpit/shared/time';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { catalogFor } from '../catalog/index.ts';
import type { Db } from '../db/index.ts';
import { ordersFor } from '../orders/index.ts';
import { AppError } from '../system/errors.ts';

export type { BatchDto, FridgeBatchDto, LabelData, ProductionSummary, CookedTotalRow };

const DEFAULT_CUTOFF = '18:00';
/** Сколько прошедших дней задача перебирает в поисках незакрытых сводок. */
const LOOKBACK_DAYS = 7;
const MAX_REPORT_DAYS = 366;
const HOUR_MS = 60 * 60 * 1000;

/** Блюдо так, как оно напечатано на этикетке: хранится на партии. */
interface DishSnapshot {
  name: { ru: string; ro: string };
  composition: { ru: string; ro: string };
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  weightG: number;
  allergens: Allergen[];
  shelfLifeHours: number;
}

interface BatchRow {
  id: number;
  code: string;
  date: string;
  dish_id: number;
  seq: number;
  status: BatchStatus;
  planned_qty: number;
  buffer_qty: number;
  dish_snapshot: string;
  confirmed_at: string | null;
  cooked_at: string | null;
  eat_by: string | null;
}

interface FridgePlan {
  id: string;
  closed: boolean;
  closedAt: string | null;
  items: Map<number, number>;
}

export interface KitchenApi {
  /** Сводка на дату: порции по блюдам и холодильникам, запас на брак, партии. Сама закрывает прошедшие сроки. */
  productionSummary(date: string): ProductionSummary;
  /** Фиксирует сводки, у которых срок приёма прошёл. Идемпотентно; возвращает число новых закрытий. */
  closeDue(): number;
  /** planned → confirmed. Повтор безопасен; приготовленную партию подтвердить нельзя. */
  confirmProduction(batchId: number, actorId: number | null): BatchDto;
  /** confirmed → cooked: сохраняет время приготовления и считает «съесть до». Повтор безопасен. */
  markCooked(batchId: number, actorId?: number | null): BatchDto;
  /** Партии, из которых наполняется холодильник на дату (с числом порций именно для него). */
  batchesFor(fridgeId: string, date: string): FridgeBatchDto[];
  /** Данные этикетки приготовленной партии. */
  labelData(batchId: number): LabelData;
  /** Приготовлено и списано за период по дате выдачи, блюду и холодильнику (для отчётов). */
  cookedTotals(from: string, to: string): CookedTotalRow[];
}

const notFound = () => new AppError(404, 'batch_not_found', 'kitchen.error.batchNotFound');

/** Целый запас в порциях: процент от плана, округление вверх. */
export function bufferFor(planned: number, percent: number): number {
  return Math.floor((planned * percent + 99) / 100);
}

/** Читаемый уникальный код партии: ГГММДД-D<блюдо>-<номер>. */
export function batchCode(date: string, dishId: number, seq: number): string {
  const [y, m, d] = date.split('-') as [string, string, string];
  return `${y.slice(2)}${m}${d}-D${String(dishId).padStart(2, '0')}-${seq}`;
}

export function createKitchenService(deps: AppDeps): KitchenApi {
  const { db, clock } = deps;
  const admin = adminFor(deps);
  const catalog = catalogFor(deps);
  const orders = ordersFor(deps);

  // Время приготовления партии попадает на карточку блюда в меню («приготовлено … в …»).
  catalog.registerCookedAtProvider(
    (date, dishId) =>
      db.get<{ cooked_at: string }>(
        `SELECT cooked_at FROM kitchen_batches
          WHERE date = ? AND dish_id = ? AND status = 'cooked' ORDER BY seq DESC LIMIT 1`,
        [date, dishId],
      )?.cooked_at ?? null,
  );

  // ---- блюда ----

  function snapshots(): Map<number, DishSnapshot> {
    return new Map(
      catalog.listDishes().map((dish) => [
        dish.id,
        {
          name: dish.name,
          composition: dish.composition,
          calories: dish.calories,
          proteinG: dish.proteinG,
          fatG: dish.fatG,
          carbsG: dish.carbsG,
          weightG: dish.weightG,
          allergens: dish.allergens,
          shelfLifeHours: dish.shelfLifeHours,
        },
      ]),
    );
  }

  const snapshotOf = (row: BatchRow): DishSnapshot => JSON.parse(row.dish_snapshot) as DishSnapshot;

  // ---- холодильники и закрытие ----

  const cutoffAt = (fridgeId: string, date: string): Date =>
    clock.cutoffFor(date, admin.getFridge(fridgeId)?.cutoffTime ?? DEFAULT_CUTOFF);

  /** Холодильники, для которых нужна сводка: активные и те, где есть заказы на дату. */
  function relevantFridges(date: string, ordered: Set<string>): string[] {
    const ids = new Set(
      admin
        .listFridges()
        .filter((f) => f.active)
        .map((f) => f.id),
    );
    for (const id of ordered) ids.add(id);
    for (const row of db.query<{ fridge_id: string }>(
      'SELECT fridge_id FROM kitchen_closures WHERE date = ?',
      [date],
    )) {
      ids.add(row.fridge_id);
    }
    return [...ids].sort();
  }

  /** Фиксирует холодильники даты, у которых срок прошёл; потом заводит партии, если закрыты все. */
  function closeDate(date: string): number {
    const live = orders.confirmedItemsByDate(date);
    const ordered = new Set(live.map((i) => i.fridgeId));
    const fridges = relevantFridges(date, ordered);
    const now = clock.now();
    let closedNow = 0;
    db.tx((tx) => {
      for (const fridgeId of fridges) {
        const exists = tx.get(
          'SELECT 1 AS x FROM kitchen_closures WHERE date = ? AND fridge_id = ?',
          [date, fridgeId],
        );
        if (exists) continue;
        const cutoff = cutoffAt(fridgeId, date);
        if (now < cutoff) continue;
        tx.run(
          'INSERT INTO kitchen_closures (date, fridge_id, cutoff_at, closed_at) VALUES (?, ?, ?, ?)',
          [date, fridgeId, cutoff.toISOString(), now.toISOString()],
        );
        for (const item of live) {
          if (item.fridgeId !== fridgeId || item.qty <= 0) continue;
          tx.run(
            `INSERT INTO kitchen_closure_items (date, fridge_id, dish_id, qty) VALUES (?, ?, ?, ?)
             ON CONFLICT (date, fridge_id, dish_id) DO UPDATE SET qty = qty + excluded.qty`,
            [date, fridgeId, item.dishId, item.qty],
          );
        }
        closedNow += 1;
      }
      const closed = tx.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM kitchen_closures WHERE date = ?',
        [date],
      )!.n;
      if (fridges.length > 0 && closed >= fridges.length) syncBatches(tx, date);
    });
    return closedNow;
  }

  // ---- партии ----

  function closureTotals(tx: Db, date: string): Map<number, number> {
    const totals = new Map<number, number>();
    for (const row of tx.query<{ dish_id: number; qty: number }>(
      'SELECT dish_id, SUM(qty) AS qty FROM kitchen_closure_items WHERE date = ? GROUP BY dish_id',
      [date],
    )) {
      totals.set(row.dish_id, row.qty);
    }
    return totals;
  }

  /** Заводит партии по снимку и подгоняет ещё не подтверждённые (запас мог поменяться в настройках). */
  function syncBatches(tx: Db, date: string): void {
    const totals = closureTotals(tx, date);
    const percent = admin.getSetting('stockBufferPercent');
    const dishes = snapshots();
    const now = clock.now().toISOString();
    for (const [dishId, planned] of totals) {
      const dish = dishes.get(dishId);
      if (!dish) continue;
      const existing = tx.get<BatchRow>(
        'SELECT * FROM kitchen_batches WHERE date = ? AND dish_id = ? AND seq = 1',
        [date, dishId],
      );
      const buffer = bufferFor(planned, percent);
      if (!existing) {
        tx.run(
          `INSERT INTO kitchen_batches
             (code, date, dish_id, seq, status, planned_qty, buffer_qty, dish_snapshot, created_at)
           VALUES (?, ?, ?, 1, 'planned', ?, ?, ?, ?)`,
          [batchCode(date, dishId, 1), date, dishId, planned, buffer, JSON.stringify(dish), now],
        );
      } else if (existing.status === 'planned') {
        const snapshot = JSON.stringify(dish);
        const same =
          existing.planned_qty === planned &&
          existing.buffer_qty === buffer &&
          existing.dish_snapshot === snapshot;
        if (!same) {
          tx.run(
            'UPDATE kitchen_batches SET planned_qty = ?, buffer_qty = ?, dish_snapshot = ? WHERE id = ?',
            [planned, buffer, snapshot, existing.id],
          );
        }
      }
    }
  }

  const loadBatch = (batchId: number): BatchRow | undefined =>
    Number.isInteger(batchId)
      ? db.get<BatchRow>('SELECT * FROM kitchen_batches WHERE id = ?', [batchId])
      : undefined;

  function toBatchDto(row: BatchRow): BatchDto {
    const snapshot = snapshotOf(row);
    return {
      id: row.id,
      code: row.code,
      date: row.date,
      dishId: row.dish_id,
      dishName: snapshot.name,
      status: row.status,
      plannedQty: row.planned_qty,
      bufferQty: row.buffer_qty,
      totalQty: row.planned_qty + row.buffer_qty,
      confirmedAt: row.confirmed_at,
      cookedAt: row.cooked_at,
      eatBy: row.eat_by,
    };
  }

  /** Проверяет переход по таблице BATCH_TRANSITIONS; отказ — 409 с понятным текстом. */
  function assertTransition(row: BatchRow, to: BatchStatus): void {
    if (BATCH_TRANSITIONS[row.status].includes(to)) return;
    const key = to === 'cooked' ? 'kitchen.error.notConfirmed' : 'kitchen.error.alreadyCooked';
    throw new AppError(409, 'invalid_transition', key);
  }

  // ---- сводка ----

  function planOf(date: string): FridgePlan[] {
    const live = orders.confirmedItemsByDate(date);
    const ordered = new Set(live.map((i) => i.fridgeId));
    const closures = new Map(
      db
        .query<{ fridge_id: string; closed_at: string }>(
          'SELECT fridge_id, closed_at FROM kitchen_closures WHERE date = ?',
          [date],
        )
        .map((r) => [r.fridge_id, r.closed_at]),
    );
    const frozen = new Map<string, Map<number, number>>();
    for (const row of db.query<{ fridge_id: string; dish_id: number; qty: number }>(
      'SELECT fridge_id, dish_id, qty FROM kitchen_closure_items WHERE date = ?',
      [date],
    )) {
      const items = frozen.get(row.fridge_id) ?? new Map<number, number>();
      items.set(row.dish_id, row.qty);
      frozen.set(row.fridge_id, items);
    }
    return relevantFridges(date, ordered).map((id) => {
      const closedAt = closures.get(id) ?? null;
      if (closedAt) return { id, closed: true, closedAt, items: frozen.get(id) ?? new Map() };
      const items = new Map<number, number>();
      for (const item of live) {
        if (item.fridgeId === id) items.set(item.dishId, (items.get(item.dishId) ?? 0) + item.qty);
      }
      return { id, closed: false, closedAt: null, items };
    });
  }

  function productionSummary(date: string): ProductionSummary {
    if (!isDateISO(date)) throw new AppError(400, 'bad_date', 'kitchen.error.date');
    closeDate(date);
    const plan = planOf(date);
    const percent = admin.getSetting('stockBufferPercent');
    const dishes = snapshots();
    const batches = new Map(
      db
        .query<BatchRow>('SELECT * FROM kitchen_batches WHERE date = ? ORDER BY dish_id, seq', [
          date,
        ])
        .map((row) => [row.dish_id, row]),
    );

    const perDish = new Map<number, Array<{ fridgeId: string; qty: number }>>();
    for (const fridge of plan) {
      for (const [dishId, qty] of [...fridge.items].sort((a, b) => a[0] - b[0])) {
        const list = perDish.get(dishId) ?? [];
        list.push({ fridgeId: fridge.id, qty });
        perDish.set(dishId, list);
      }
    }

    let planned = 0;
    let buffer = 0;
    const dishLines = [...perDish.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dishId, fridges]) => {
        const qty = fridges.reduce((sum, f) => sum + f.qty, 0);
        const batch = batches.get(dishId);
        // подтверждённая партия уже зафиксировала запас; пока партия не подтверждена — действует настройка
        const bufferQty =
          batch && batch.status !== 'planned' ? batch.buffer_qty : bufferFor(qty, percent);
        planned += qty;
        buffer += bufferQty;
        const dish = dishes.get(dishId);
        return {
          dishId,
          name: dish?.name ?? { ru: `#${dishId}`, ro: `#${dishId}` },
          planned: qty,
          buffer: bufferQty,
          total: qty + bufferQty,
          fridges,
          batch: batch ? toBatchDto(batch) : null,
        };
      });

    const fridgeLines = plan.map((fridge) => {
      const info = admin.getFridge(fridge.id);
      return {
        id: fridge.id,
        name: info?.name ?? fridge.id,
        gymName: info?.gymName ?? '',
        cutoffAt: cutoffAt(fridge.id, date).toISOString(),
        closed: fridge.closed,
        closedAt: fridge.closedAt,
        boxes: [...fridge.items.values()].reduce((sum, qty) => sum + qty, 0),
      };
    });

    return {
      date,
      closed: plan.length > 0 && plan.every((f) => f.closed),
      bufferPercent: percent,
      fridges: fridgeLines,
      dishes: dishLines,
      totals: { planned, buffer, total: planned + buffer },
    };
  }

  function closeDue(): number {
    const today = clock.localDate();
    let closed = 0;
    // сроки на D наступают в D−1, поэтому последняя интересная дата — завтра (а то и послезавтра при позднем сроке)
    for (let offset = -LOOKBACK_DAYS; offset <= 2; offset += 1) {
      closed += closeDate(addDaysISO(today, offset));
    }
    return closed;
  }

  // ---- партии: переходы ----

  function confirmProduction(batchId: number, actorId: number | null): BatchDto {
    const row = loadBatch(batchId);
    if (!row) throw notFound();
    if (row.status === 'confirmed') return toBatchDto(row);
    assertTransition(row, 'confirmed');
    db.tx((tx) => {
      tx.run(
        `UPDATE kitchen_batches SET status = 'confirmed', confirmed_at = ?, confirmed_by = ? WHERE id = ?`,
        [clock.now().toISOString(), actorId, batchId],
      );
      admin.audit(actorId, 'kitchen.confirm', `batch:${batchId}`, { code: row.code });
    });
    return toBatchDto(loadBatch(batchId)!);
  }

  function markCooked(batchId: number, actorId: number | null = null): BatchDto {
    const row = loadBatch(batchId);
    if (!row) throw notFound();
    if (row.status === 'cooked') return toBatchDto(row);
    assertTransition(row, 'cooked');
    const now = clock.now();
    // срок хранения берём по блюду на момент приготовления; если блюда уже нет — как на партии
    const snapshot = snapshots().get(row.dish_id) ?? snapshotOf(row);
    const eatBy = new Date(now.getTime() + snapshot.shelfLifeHours * HOUR_MS);
    db.tx((tx) => {
      tx.run(
        `UPDATE kitchen_batches
            SET status = 'cooked', cooked_at = ?, cooked_by = ?, eat_by = ?, dish_snapshot = ?
          WHERE id = ?`,
        [now.toISOString(), actorId, eatBy.toISOString(), JSON.stringify(snapshot), batchId],
      );
      admin.audit(actorId, 'kitchen.cooked', `batch:${batchId}`, {
        code: row.code,
        quantity: row.planned_qty + row.buffer_qty,
      });
    });
    return toBatchDto(loadBatch(batchId)!);
  }

  function batchesFor(fridgeId: string, date: string): FridgeBatchDto[] {
    const result: FridgeBatchDto[] = [];
    const rows = db.query<BatchRow & { fridge_qty: number }>(
      `SELECT b.*, i.qty AS fridge_qty
         FROM kitchen_batches b
         JOIN kitchen_closure_items i
           ON i.date = b.date AND i.dish_id = b.dish_id AND i.fridge_id = ?
        WHERE b.date = ?
        ORDER BY b.dish_id, b.seq`,
      [fridgeId, date],
    );
    for (const row of rows) result.push({ ...toBatchDto(row), fridgeQty: row.fridge_qty });
    return result;
  }

  function labelData(batchId: number): LabelData {
    const row = loadBatch(batchId);
    if (!row) throw notFound();
    if (row.status !== 'cooked' || !row.cooked_at || !row.eat_by) {
      throw new AppError(409, 'batch_not_cooked', 'kitchen.error.notCooked');
    }
    const dish = snapshotOf(row);
    return {
      batchId: row.id,
      code: row.code,
      date: row.date,
      copies: Math.min(MAX_LABEL_COPIES, Math.max(1, row.planned_qty + row.buffer_qty)),
      dish: {
        name: dish.name,
        composition: dish.composition,
        calories: dish.calories,
        proteinG: dish.proteinG,
        fatG: dish.fatG,
        carbsG: dish.carbsG,
        weightG: dish.weightG,
        allergens: dish.allergens,
      },
      cookedAt: row.cooked_at,
      eatBy: row.eat_by,
      size: parseLabelSize(admin.getSetting('labelSize')),
    };
  }

  function cookedTotals(from: string, to: string): CookedTotalRow[] {
    if (!isDateISO(from) || !isDateISO(to) || from > to) {
      throw new AppError(400, 'bad_range', 'kitchen.error.range');
    }
    if (addDaysISO(from, MAX_REPORT_DAYS) < to) {
      throw new AppError(400, 'bad_range', 'kitchen.error.range');
    }
    const rows = new Map<string, CookedTotalRow>();
    const row = (date: string, dishId: number, fridgeId: string | null): CookedTotalRow => {
      const key = `${date}|${dishId}|${fridgeId ?? ''}`;
      let entry = rows.get(key);
      if (!entry) {
        entry = { date, dishId, fridgeId, cooked: 0, writtenOff: 0 };
        rows.set(key, entry);
      }
      return entry;
    };
    const cooked = db.query<BatchRow>(
      `SELECT * FROM kitchen_batches WHERE status = 'cooked' AND date BETWEEN ? AND ?`,
      [from, to],
    );
    for (const batch of cooked) {
      for (const item of db.query<{ fridge_id: string; qty: number }>(
        'SELECT fridge_id, qty FROM kitchen_closure_items WHERE date = ? AND dish_id = ?',
        [batch.date, batch.dish_id],
      )) {
        row(batch.date, batch.dish_id, item.fridge_id).cooked += item.qty;
      }
      if (batch.buffer_qty > 0) row(batch.date, batch.dish_id, null).cooked += batch.buffer_qty;
    }
    // списанные порции — заказы в статусе written_off (их ставит выдача)
    for (const closure of db.query<{ date: string; fridge_id: string }>(
      'SELECT date, fridge_id FROM kitchen_closures WHERE date BETWEEN ? AND ? ORDER BY date, fridge_id',
      [from, to],
    )) {
      for (const order of orders.listByFridgeDate(closure.fridge_id, closure.date)) {
        if (order.status !== 'written_off') continue;
        for (const item of order.items) {
          row(closure.date, item.dishId, closure.fridge_id).writtenOff += item.qty;
        }
      }
    }
    return [...rows.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.dishId - b.dishId ||
        (a.fridgeId ?? '￿').localeCompare(b.fridgeId ?? '￿'),
    );
  }

  return {
    productionSummary,
    closeDue,
    confirmProduction,
    markCooked,
    batchesFor,
    labelData,
    cookedTotals,
  };
}
