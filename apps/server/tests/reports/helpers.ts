// Помощники тестов отчётов: «день с выдачей» через настоящий путь заказа и несколько способов
// добавить в базу готовые выданные заказы (для периодов, которые путём не пройти за один тест).
// Время: заказы на 11 марта 2026; цена кредита — цена пакета на момент покупки.
import { adminFor } from '../../src/modules/admin/index.ts';
import { createFridge, createGym } from '../admin/helpers.ts';
import { buyPaid } from '../billing/helpers.ts';
import {
  call,
  clientWithCredits,
  closeIntake,
  cookAll,
  makeFulfillmentApp,
  markLoaded,
  pickupByCode,
  PICKUP_MORNING,
  PICKUP_NIGHT,
  placeOk,
  TOMORROW,
  type FulfillmentTest,
} from '../fulfillment/helpers.ts';
import { rate } from '../feedback/helpers.ts';

export { call, TOMORROW };
export type { FulfillmentTest };

export const PHONES = {
  second: '+37360555201',
  third: '+37360555202',
  fourth: '+37360555203',
  fifth: '+37360555204',
} as const;

/** Цена кредита в пакетах 12 / 20 / 30 боксов, бани (стартовые цены 119 / 109 / 99 лей). */
export const PRICE = { 12: 11900, 20: 10900, 30: 9900 } as const;

export interface ReportsDay extends FulfillmentTest {
  gym2Id: string;
  fridge2Id: string;
  cookies: { first: string; second: string; third: string; fourth: string; fifth: string };
  /** Заказы дня: идентификаторы и коды. */
  orders: Record<'first' | 'second' | 'third' | 'fourth', { id: string; code: string }>;
  clients: Record<'first' | 'second' | 'third' | 'fourth' | 'fifth', number>;
}

/**
 * День 11 марта 2026 целиком. Два зала: «Тест» (12,5 %, холодильник 1) и «Север» (10 %, холодильник 2).
 *  first  (пакет 12): холодильник 1, блюдо A ×2 и B ×1 — выдан;
 *  second (пакет 20): холодильник 1, блюдо A ×1 — выдан;
 *  third  (пакет 30): холодильник 2, блюдо B ×2 — выдан;
 *  fourth (пакет 12): холодильник 1, блюдо C ×1 — не забрал, день закрыт оператором, бокс списан;
 *  fifth  (пакет 12): холодильник 1, блюдо C ×1 — отменил заказ до срока.
 * Кроме того, оператор списал лишний бокс блюда B (брак) без заказа.
 */
export async function makeReportsDay(
  options: { bufferPercent?: number } = {},
): Promise<ReportsDay> {
  const base = await makeFulfillmentApp({ credits: 0 });
  if (options.bufferPercent !== undefined) {
    adminFor(base.deps).setSetting('stockBufferPercent', options.bufferPercent, base.adminId);
  }
  const [a, b, c] = base.dishes;
  const gym2 = await createGym(base, { name: 'Зал «Север»', sharePercent: 10 });
  const fridge2 = await createFridge(base, gym2.id, { name: 'Холодильник у стойки' });

  const first = base.client;
  await buyPaid(base, first, 12);
  const second = await clientWithCredits(base, PHONES.second, 20);
  const third = await clientWithCredits(base, PHONES.third, 30);
  const fourth = await clientWithCredits(base, PHONES.fourth, 12);
  const fifth = await clientWithCredits(base, PHONES.fifth, 12);

  const o1 = await placeOk(base, first, {
    items: [
      { dishId: a, qty: 2 },
      { dishId: b, qty: 1 },
    ],
  });
  const o2 = await placeOk(base, second, { items: [{ dishId: a, qty: 1 }] });
  const o3 = await placeOk(base, third, {
    fridgeId: fridge2.id,
    items: [{ dishId: b, qty: 2 }],
  });
  const o4 = await placeOk(base, fourth, { items: [{ dishId: c, qty: 1 }] });
  const o5 = await placeOk(base, fifth, { items: [{ dishId: c, qty: 1 }] });
  const cancelled = await call(base, 'POST', `/orders/${o5.id}/cancel`, fifth);
  if (cancelled.statusCode !== 200) throw new Error(`Отмена не удалась: ${cancelled.body}`);

  await closeIntake(base);
  await cookAll(base);
  for (const fridgeId of [base.fridgeId, fridge2.id]) {
    const loaded = await markLoaded(base, base.admin, fridgeId);
    if (loaded.statusCode !== 200) throw new Error(`Не загружено: ${loaded.body}`);
  }

  base.clock.set(PICKUP_MORNING);
  for (const [code, fridgeId] of [
    [o1.code!, base.fridgeId],
    [o2.code!, base.fridgeId],
    [o3.code!, fridge2.id],
  ] as const) {
    const res = await pickupByCode(base, code, base.admin, fridgeId);
    if (res.statusCode !== 200) throw new Error(`Не выдано: ${res.statusCode} ${res.body}`);
  }

  base.clock.set(PICKUP_NIGHT);
  const closed = await call(
    base,
    'POST',
    `/operator/fridges/${base.fridgeId}/close-day`,
    base.admin,
    {
      date: TOMORROW,
      remaining: 2,
      extras: [{ dishId: b, qty: 1, reason: 'defect' }],
    },
  );
  if (closed.statusCode !== 200) throw new Error(`День не закрыт: ${closed.body}`);

  return {
    ...base,
    gym2Id: gym2.id,
    fridge2Id: fridge2.id,
    cookies: { first, second, third, fourth, fifth },
    orders: {
      first: { id: o1.id, code: o1.code! },
      second: { id: o2.id, code: o2.code! },
      third: { id: o3.id, code: o3.code! },
      fourth: { id: o4.id, code: o4.code! },
    },
    clients: {
      first: base.clientId,
      second: idOf(base, PHONES.second),
      third: idOf(base, PHONES.third),
      fourth: idOf(base, PHONES.fourth),
      fifth: idOf(base, PHONES.fifth),
    },
  };
}

function idOf(test: FulfillmentTest, phone: string): number {
  return test.deps.db.get<{ id: number }>('SELECT id FROM users WHERE phone = ?', [phone])!.id;
}

/** Клиенты оценивают выданные блюда: A — 5 и 3 звезды, B — 4. */
export async function rateDelivered(day: ReportsDay): Promise<void> {
  const [a, b] = day.dishes;
  const ratings = [
    [day.cookies.first, day.orders.first.id, a, 5],
    [day.cookies.first, day.orders.first.id, b, 4],
    [day.cookies.second, day.orders.second.id, a, 3],
  ] as const;
  for (const [cookie, orderId, dishId, stars] of ratings) {
    const res = await rate(day, cookie, { orderId, dishId, stars });
    if (res.statusCode !== 200) throw new Error(`Оценка не принята: ${res.statusCode} ${res.body}`);
  }
}

export const report = (
  test: FulfillmentTest,
  kind: string,
  query = 'from=2026-03-01&to=2026-03-31',
  cookie: string = test.admin,
  lang?: 'ru' | 'ro',
) =>
  test.app.inject({
    method: 'GET',
    url: `/api/v1/admin/reports/${kind}?${query}`,
    headers: { cookie, ...(lang ? { 'accept-language': lang } : {}) },
  });

export const reportCsv = (
  test: FulfillmentTest,
  kind: string,
  query = 'from=2026-03-01&to=2026-03-31',
  cookie: string = test.admin,
  lang?: 'ru' | 'ro',
) =>
  test.app.inject({
    method: 'GET',
    url: `/api/v1/admin/reports/${kind}/csv?${query}`,
    headers: { cookie, ...(lang ? { 'accept-language': lang } : {}) },
  });

let orderSeq = 0;

/**
 * Готовый выданный заказ прямо в базу: для периодов и объёмов, которые путём заказа не набрать.
 * Кредиты в журнал не пишутся, поэтому выручка такого заказа в отчётах нулевая.
 */
export function insertDelivered(
  test: FulfillmentTest,
  input: { userId: number; fridgeId?: string; date: string; boxes?: number; dishId?: number },
): string {
  const id = `seed-order-${++orderSeq}`;
  const fridgeId = input.fridgeId ?? test.fridgeId;
  const boxes = input.boxes ?? 1;
  const code = String(1000 + (orderSeq % 9000)).padStart(4, '0');
  const at = `${input.date}T08:00:00.000Z`;
  test.deps.db.run(
    `INSERT INTO orders (id, user_id, fridge_id, date, status, code, boxes, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'picked_up', ?, ?, ?, ?, ?)`,
    [id, input.userId, fridgeId, input.date, code, boxes, id, at, at],
  );
  test.deps.db.run(
    `INSERT INTO order_items (order_id, dish_id, qty, name_ru, name_ro, calories, protein_g, fat_g, carbs_g, fiber_g, position)
     VALUES (?, ?, ?, 'Блюдо', 'Fel', 500, 40, 14, 55, 6, 0)`,
    [id, input.dishId ?? test.dishes[0], boxes],
  );
  return id;
}

/** Зал с холодильником одним вызовом. */
export async function addGymWithFridge(
  test: FulfillmentTest,
  name: string,
  sharePercent = 5,
): Promise<{ gymId: string; fridgeId: string }> {
  const gym = await createGym(test, { name, sharePercent });
  const fridge = await createFridge(test, gym.id, { name: `Холодильник ${name}` });
  return { gymId: gym.id, fridgeId: fridge.id };
}
