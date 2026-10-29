// Свойство «баланс = сумма журнала» на случайных последовательностях операций.
// Операции выбираются генератором с зерном (повторяемо), после КАЖДОЙ проверяются инварианты:
//   1. баланс из сервиса = сумма записей журнала пользователя (и она не отрицательна);
//   2. сумма остатков лотов = сумме журнала; остаток лота в пределах [0, credits];
//   3. сгоревшие и просроченные лоты пусты;
//   4. удержание по каждому заказу и лоту не отрицательно;
//   5. баланс совпадает с независимым подсчётом по результатам операций (куплено, зачислено,
//      удержано под заказы, возвращено, сгорело, возвращено деньгами).
import { describe, expect, it } from 'vitest';
import { addClient, DAY, makeBillingApp, newKey, packageId, type BillingTest } from './helpers.ts';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Model {
  /** Всё, что зачислено: покупки, перенос, промо, кредиты по жалобам. */
  credited: number;
  /** Кредиты, ушедшие под заказы и ещё не вернувшиеся. */
  held: number;
  /** Возвращено деньгами. */
  refunded: number;
  orders: Map<string, { count: number; consumed: boolean }>;
}

function checkInvariants(test: BillingTest, userId: number, model: Model, label: string): void {
  const { db } = test.app.deps;
  const balance = test.billing.balance(userId); // обрабатывает сгоревшие лоты
  const sum = db.get<{ n: number }>(
    'SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = ?',
    [userId],
  )!.n;
  expect(balance, `${label}: баланс = сумма журнала`).toBe(sum);
  expect(balance, `${label}: баланс не отрицателен`).toBeGreaterThanOrEqual(0);

  const now = test.clock.now().toISOString();
  const lots = db.query<{
    id: number;
    credits: number;
    expires_at: string;
    expired_at: string | null;
    remaining: number;
  }>(
    `SELECT l.id, l.credits, l.expires_at, l.expired_at, COALESCE(SUM(e.delta), 0) AS remaining
       FROM credit_lots l LEFT JOIN credit_ledger e ON e.lot_id = l.id
      WHERE l.user_id = ? GROUP BY l.id`,
    [userId],
  );
  expect(
    lots.reduce((s, l) => s + l.remaining, 0),
    `${label}: сумма остатков лотов = сумма журнала`,
  ).toBe(sum);
  for (const lot of lots) {
    expect(lot.remaining, `${label}: лот ${lot.id} не в минусе`).toBeGreaterThanOrEqual(0);
    expect(lot.remaining, `${label}: лот ${lot.id} не больше исходного`).toBeLessThanOrEqual(
      lot.credits,
    );
    if (lot.expires_at <= now) {
      expect(lot.expired_at, `${label}: лот ${lot.id} обработан`).not.toBeNull();
      expect(lot.remaining, `${label}: сгоревший лот ${lot.id} пуст`).toBe(0);
    }
  }

  const held = db.query<{ order_id: string; lot_id: number; held: number }>(
    `SELECT order_id, lot_id, -SUM(delta) AS held FROM credit_ledger
      WHERE user_id = ? AND reason IN ('reserve', 'release') GROUP BY order_id, lot_id`,
    [userId],
  );
  for (const row of held)
    expect(row.held, `${label}: заказ ${row.order_id}`).toBeGreaterThanOrEqual(0);

  const burned = db.get<{ n: number }>(
    "SELECT COALESCE(-SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = ? AND reason = 'expire'",
    [userId],
  )!.n;
  expect(balance, `${label}: независимый подсчёт`).toBe(
    model.credited - model.held - burned - model.refunded,
  );
}

async function runScenario(seed: number, steps: number): Promise<void> {
  const test = await makeBillingApp();
  const other = await addClient(test);
  const users = [test.clientId, other.id];
  const next = rng(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)]!;
  const models = new Map<number, Model>(
    users.map((id) => [id, { credited: 0, held: 0, refunded: 0, orders: new Map() }]),
  );
  let orderSeq = 0;

  for (let step = 0; step < steps; step += 1) {
    const userId = pick(users);
    const model = models.get(userId)!;
    const roll = next();
    let label = `seed ${seed} шаг ${step}`;

    if (roll < 0.2) {
      const boxes = pick([1, 12, 20]);
      label += ` купить ${boxes}`;
      const { purchase } = await test.billing.startPurchase(userId, {
        packageId: packageId(test, boxes),
        method: 'card',
        idempotencyKey: newKey(),
      });
      expect(purchase.status).toBe('paid');
      model.credited += purchase.boxes + purchase.carriedOver;
    } else if (roll < 0.45) {
      const count = 1 + Math.floor(next() * 4);
      const orderId = `o-${++orderSeq}`;
      label += ` резерв ${count}`;
      const available = test.billing.balance(userId);
      if (count > available) {
        expect(() => test.billing.reserve(userId, count, orderId), label).toThrowError(
          expect.objectContaining({ code: 'insufficient_credits' }),
        );
      } else {
        test.billing.reserve(userId, count, orderId);
        model.held += count;
        model.orders.set(orderId, { count, consumed: false });
      }
    } else if (roll < 0.6) {
      const open = [...model.orders].filter(([, o]) => !o.consumed && o.count > 0);
      if (open.length === 0) continue;
      const [orderId, order] = pick(open);
      label += ` release ${orderId}`;
      const before = test.billing.balance(userId);
      const result = test.billing.release(orderId);
      expect(result.released + result.expired, label).toBe(order.count);
      model.held -= order.count;
      model.orders.set(orderId, { count: 0, consumed: false });
      // вернувшееся в живые лоты прибавилось к балансу, остальное сгорело сразу
      expect(test.billing.balance(userId), label).toBe(before + result.released);
      // повтор безопасен
      expect(test.billing.release(orderId), label).toEqual({ released: 0, expired: 0 });
    } else if (roll < 0.7) {
      const open = [...model.orders].filter(([, o]) => !o.consumed && o.count > 0);
      if (open.length === 0) continue;
      const [orderId, order] = pick(open);
      label += ` consume ${orderId}`;
      const before = test.billing.balance(userId);
      test.billing.consume(orderId);
      test.billing.consume(orderId);
      expect(test.billing.balance(userId), label).toBe(before);
      model.orders.set(orderId, { count: order.count, consumed: true });
    } else if (roll < 0.85) {
      const days = Math.floor(next() * 40);
      label += ` ждать ${days} дн.`;
      test.clock.advance(days * DAY + Math.floor(next() * DAY));
      test.billing.expireDue();
    } else if (roll < 0.92) {
      label += ' жалоба';
      const granted = test.billing.grantComplaintCredit(userId, `cmp-${seed}-${step}`);
      expect(granted.granted).toBe(true);
      model.credited += 1;
    } else {
      // возврат денег за неиспользованное
      const purchases = test.app.deps.db.query<{ id: number }>(
        "SELECT id FROM purchases WHERE user_id = ? AND status = 'paid' ORDER BY id",
        [userId],
      );
      if (purchases.length === 0) continue;
      const purchaseId = pick(purchases).id;
      label += ` возврат по ${purchaseId}`;
      const credits = 1 + Math.floor(next() * 3);
      try {
        const done = await test.billing.refund(test.adminId, {
          purchaseId,
          credits,
          reason: 'свойство',
        });
        expect(done.status, label).toBe('done');
        model.refunded += done.credits;
      } catch (error) {
        // единственный допустимый отказ — нечего или нельзя возвращать
        expect((error as { status?: number }).status, `${label}: ${String(error)}`).toBe(409);
      }
    }

    for (const id of users) checkInvariants(test, id, models.get(id)!, label);
  }
}

describe('свойство: баланс всегда равен сумме журнала', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919);
  it.each(seeds)(
    'случайная последовательность операций, зерно %i',
    async (seed) => {
      await runScenario(seed, 70);
    },
    60_000,
  );
});
