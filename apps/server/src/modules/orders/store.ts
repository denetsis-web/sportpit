// Хранилище заказов: чтение и запись строк, подсчёт занятых мест, выдача кода получения.
// Правил здесь нет (сроки, лимиты, вместимость — в service.ts): только SQL.
import { randomInt } from 'node:crypto';
import { ORDER_CODE_LENGTH, type OrderStatus } from '@sportpit/shared/schemas/orders';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';

export interface OrderItemRecord {
  dishId: number;
  qty: number;
  name: { ru: string; ro: string };
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
}

/** Заказ целиком — то, что видят другие модули (кухня, выдача, отчёты). */
export interface OrderRecord {
  id: string;
  userId: number;
  fridgeId: string;
  /** День выдачи, YYYY-MM-DD. */
  date: string;
  status: OrderStatus;
  /** Одноразовый код получения из 4 цифр. */
  code: string;
  boxes: number;
  items: OrderItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemTotal {
  fridgeId: string;
  dishId: number;
  qty: number;
}

interface OrderRow {
  id: string;
  user_id: number;
  fridge_id: string;
  date: string;
  status: OrderStatus;
  code: string;
  boxes: number;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  order_id: string;
  dish_id: number;
  qty: number;
  name_ru: string;
  name_ro: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
}

function hydrate(db: Db, rows: OrderRow[]): OrderRecord[] {
  if (rows.length === 0) return [];
  const byOrder = new Map<string, OrderItemRecord[]>();
  // позиции берём одним запросом на пачку заказов (до 500 в пачке: лимит переменных SQLite)
  for (let from = 0; from < rows.length; from += 500) {
    const ids = rows.slice(from, from + 500).map((r) => r.id);
    const items = db.query<ItemRow>(
      `SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})
        ORDER BY order_id, position, dish_id`,
      ids,
    );
    for (const item of items) {
      const list = byOrder.get(item.order_id) ?? [];
      list.push({
        dishId: item.dish_id,
        qty: item.qty,
        name: { ru: item.name_ru, ro: item.name_ro },
        calories: item.calories,
        proteinG: item.protein_g,
        fatG: item.fat_g,
        carbsG: item.carbs_g,
        fiberG: item.fiber_g,
      });
      byOrder.set(item.order_id, list);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fridgeId: row.fridge_id,
    date: row.date,
    status: row.status,
    code: row.code,
    boxes: row.boxes,
    items: byOrder.get(row.id) ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function loadOrder(db: Db, id: string): OrderRecord | undefined {
  const row = db.get<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]);
  return row ? hydrate(db, [row])[0] : undefined;
}

export function loadOrders(
  db: Db,
  where: string,
  params: Array<string | number> = [],
  tail = 'ORDER BY date, created_at, id',
): OrderRecord[] {
  return hydrate(db, db.query<OrderRow>(`SELECT * FROM orders WHERE ${where} ${tail}`, params));
}

export function orderIdByKey(db: Db, userId: number, key: string): string | undefined {
  return db.get<{ id: string }>('SELECT id FROM orders WHERE user_id = ? AND idempotency_key = ?', [
    userId,
    key,
  ])?.id;
}

export function countUserOrders(db: Db, userId: number): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?', [userId])!.n;
}

/** Боксы действующих (не отменённых) заказов на день: по холодильнику или по клиенту. */
export function boxesOnDate(
  db: Db,
  date: string,
  scope: { fridgeId: string } | { userId: number },
): number {
  const column = 'fridgeId' in scope ? 'fridge_id' : 'user_id';
  const value = 'fridgeId' in scope ? scope.fridgeId : scope.userId;
  return db.get<{ n: number }>(
    `SELECT COALESCE(SUM(boxes), 0) AS n FROM orders
      WHERE date = ? AND ${column} = ? AND status <> 'cancelled'`,
    [date, value],
  )!.n;
}

/** Сколько порций блюда на день заняли действующие заказы (поставщик занятых порций для catalog). */
export function reservedPortions(db: Db, date: string, dishId: number): number {
  return db.get<{ n: number }>(
    `SELECT COALESCE(SUM(i.qty), 0) AS n
       FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.date = ? AND i.dish_id = ? AND o.status <> 'cancelled'`,
    [date, dishId],
  )!.n;
}

export function itemTotalsByDate(db: Db, date: string): ItemTotal[] {
  return db
    .query<{ fridge_id: string; dish_id: number; qty: number }>(
      `SELECT o.fridge_id, i.dish_id, SUM(i.qty) AS qty
         FROM orders o JOIN order_items i ON i.order_id = o.id
        WHERE o.date = ? AND o.status IN ('confirmed', 'loaded')
        GROUP BY o.fridge_id, i.dish_id
        ORDER BY o.fridge_id, i.dish_id`,
      [date],
    )
    .map((r) => ({ fridgeId: r.fridge_id, dishId: r.dish_id, qty: r.qty }));
}

const CODE_SPACE = 10 ** ORDER_CODE_LENGTH;
const RANDOM_ATTEMPTS = 10;

const formatCode = (n: number): string => String(n % CODE_SPACE).padStart(ORDER_CODE_LENGTH, '0');

/**
 * Код получения из 4 цифр, свободный на холодильник и дату (занятыми считаются коды действующих заказов:
 * отменённый заказ код освобождает). Сначала несколько случайных попыток, потом первый свободный код
 * от случайной точки; кончились все 10 000 — отказ.
 */
export function allocateCode(
  db: Db,
  fridgeId: string,
  date: string,
  random: () => number = () => randomInt(CODE_SPACE),
): string {
  const taken = (code: string): boolean =>
    db.get(
      `SELECT 1 AS x FROM orders WHERE fridge_id = ? AND date = ? AND code = ? AND status <> 'cancelled'`,
      [fridgeId, date, code],
    ) !== undefined;
  let start = 0;
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
    start = random();
    const code = formatCode(start);
    if (!taken(code)) return code;
  }
  for (let step = 1; step < CODE_SPACE; step += 1) {
    const code = formatCode(start + step);
    if (!taken(code)) return code;
  }
  throw new AppError(409, 'code_unavailable', 'orders.error.codeUnavailable');
}
