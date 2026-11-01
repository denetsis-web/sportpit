import { describe, expect, it } from 'vitest';
import { billingFor } from '../../src/modules/billing/index.ts';
import { buyPaid, DAY } from '../billing/helpers.ts';
import { clientWithCredits, summary } from '../kitchen/helpers.ts';
import { call, TOMORROW } from '../fulfillment/helpers.ts';
import { makeReportsDay, type ReportsDay } from '../reports/helpers.ts';

const SIXTH_PHONE = '+37360555299';

/** Сверка журнала кредитов с покупками, заказами и сгоранием: источники — таблицы покупок и заказов. */
function reconcile(day: ReportsDay, userId: number) {
  const db = day.deps.db;
  const one = <T>(sql: string): T => db.get<T>(sql, [userId])!;
  const purchased = one<{ n: number }>(
    "SELECT COALESCE(SUM(boxes), 0) AS n FROM purchases WHERE user_id = ? AND status = 'paid'",
  ).n;
  const open = one<{ n: number }>(
    "SELECT COALESCE(SUM(boxes), 0) AS n FROM orders WHERE user_id = ? AND status IN ('confirmed', 'loaded')",
  ).n;
  const spent = one<{ n: number }>(
    "SELECT COALESCE(SUM(boxes), 0) AS n FROM orders WHERE user_id = ? AND status IN ('picked_up', 'written_off')",
  ).n;
  const burned = one<{ n: number }>(
    "SELECT COALESCE(-SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = ? AND reason = 'expire'",
  ).n;
  const journal = one<{ n: number }>(
    'SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = ?',
  ).n;
  return {
    purchased,
    open,
    spent,
    burned,
    journal,
    api: billingFor(day.deps).balance(userId),
    // покупки − сгоревшее − зарезервированное под открытые заказы − потраченное на выданные и списанные боксы
    expected: purchased - burned - open - spent,
  };
}

describe('сверка журнала кредитов и сводки кухни (R48, R60)', () => {
  it('баланс = покупки − резервы − потраченное на выданные и списанные боксы; журнал и API совпадают', async () => {
    const day = await makeReportsDay();
    const c = day.clients;
    // разобрано вручную: first 12−3, second 20−1, third 30−2, fourth 12−1 (списанный бокс остаётся потраченным),
    // fifth 12 (заказ отменён: резерв вернулся)
    const expected = [
      [c.first, 9],
      [c.second, 19],
      [c.third, 28],
      [c.fourth, 11],
      [c.fifth, 12],
    ] as const;
    for (const [userId, balance] of expected) {
      const r = reconcile(day, userId);
      expect(r.journal, `журнал клиента ${userId}`).toBe(balance);
      expect(r.api, `баланс клиента ${userId}`).toBe(balance);
      expect(r.expected, `покупки и заказы клиента ${userId}`).toBe(balance);
    }
  });

  it('каждый выданный и списанный заказ отмечен ровно один раз и использовал столько кредитов, сколько в нём боксов', async () => {
    const day = await makeReportsDay();
    const db = day.deps.db;
    const finished = db.query<{ id: string; boxes: number }>(
      "SELECT id, boxes FROM orders WHERE status IN ('picked_up', 'written_off') ORDER BY id",
    );
    expect(finished).toHaveLength(4);
    for (const order of finished) {
      const marks = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM credit_ledger WHERE order_id = ? AND reason = 'consume'",
        [order.id],
      )!.n;
      const held = db.get<{ n: number }>(
        "SELECT COALESCE(-SUM(delta), 0) AS n FROM credit_ledger WHERE order_id = ? AND reason IN ('reserve', 'release')",
        [order.id],
      )!.n;
      expect(marks, `отметка выдачи заказа ${order.id}`).toBe(1);
      expect(held, `кредиты заказа ${order.id}`).toBe(order.boxes);
    }
    // отменённый заказ вернул всё зарезервированное
    const cancelled = db.query<{ id: string }>("SELECT id FROM orders WHERE status = 'cancelled'");
    expect(cancelled).toHaveLength(1);
    expect(
      db.get<{ n: number }>(
        'SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE order_id = ?',
        [cancelled[0]!.id],
      )!.n,
    ).toBe(0);
    // остаток каждого лота не отрицателен, а сумма по лотам равна сумме журнала
    const lots = db.query<{ remaining: number }>(
      `SELECT COALESCE(SUM(e.delta), 0) AS remaining FROM credit_lots l
         LEFT JOIN credit_ledger e ON e.lot_id = l.id GROUP BY l.id`,
    );
    expect(lots.every((l) => l.remaining >= 0)).toBe(true);
    expect(lots.reduce((sum, l) => sum + l.remaining, 0)).toBe(
      db.get<{ n: number }>('SELECT SUM(delta) AS n FROM credit_ledger')!.n,
    );
  });

  it('сгорание тоже сходится: через 46 дней неиспользованные кредиты сгорели, потраченные остались потраченными', async () => {
    const day = await makeReportsDay();
    await clientWithCredits(day, SIXTH_PHONE, 12); // шестой клиент купил пакет и ничего не заказал
    day.clock.advance(46 * DAY);
    await day.deps.system.scheduler.runNow('billing-expire');

    const ids = [...Object.values(day.clients)];
    ids.push(
      day.deps.db.get<{ id: number }>('SELECT id FROM users WHERE phone = ?', [SIXTH_PHONE])!.id,
    );
    let burnedTotal = 0;
    for (const userId of ids) {
      const r = reconcile(day, userId);
      expect(r.api, `баланс клиента ${userId}`).toBe(0);
      expect(r.journal, `журнал клиента ${userId}`).toBe(0);
      expect(r.expected, `сверка клиента ${userId}`).toBe(0);
      burnedTotal += r.burned;
    }
    // сгорело всё неиспользованное: (12−3) + (20−1) + (30−2) + (12−1) + 12 + 12
    expect(burnedTotal).toBe(9 + 19 + 28 + 11 + 12 + 12);
  });

  it('сводка кухни равна подтверждённым заказам: по блюдам и холодильникам, отменённые не входят', async () => {
    const day = await makeReportsDay();
    const db = day.deps.db;
    const [a, b, c] = day.dishes;
    const s = await summary(day, TOMORROW);

    // подтверждённые заказы на день, посчитанные из таблицы заказов (кроме отменённого fifth)
    const fromOrders = db.query<{ dish_id: number; fridge_id: string; qty: number }>(
      `SELECT i.dish_id, o.fridge_id, SUM(i.qty) AS qty
         FROM orders o JOIN order_items i ON i.order_id = o.id
        WHERE o.date = ? AND o.status <> 'cancelled' GROUP BY i.dish_id, o.fridge_id`,
      [TOMORROW],
    );
    const expectedByDish = new Map<number, number>();
    for (const row of fromOrders) {
      expectedByDish.set(row.dish_id, (expectedByDish.get(row.dish_id) ?? 0) + row.qty);
    }
    expect([...expectedByDish.entries()].sort()).toEqual([
      [a, 3],
      [b, 3],
      [c, 1],
    ]);
    for (const dish of s.dishes) {
      expect(dish.planned, `блюдо ${dish.dishId}`).toBe(expectedByDish.get(dish.dishId));
      for (const fridge of dish.fridges) {
        const match = fromOrders.find(
          (r) => r.dish_id === dish.dishId && r.fridge_id === fridge.fridgeId,
        );
        expect(fridge.qty, `блюдо ${dish.dishId} в ${fridge.fridgeId}`).toBe(match?.qty);
      }
    }
    expect(s.totals.planned).toBe(7);
    expect(s.dishes.map((d) => d.dishId).sort()).toEqual([a, b, c].sort());
    // партии: плановое количество равно сводке, по статусу все приготовлены
    for (const dish of s.dishes) {
      expect(dish.batch).toMatchObject({ plannedQty: dish.planned, status: 'cooked' });
    }
    // расхождения нет и по API кухни после закрытия дня
    const again = await call(day, 'GET', `/kitchen/summary?date=${TOMORROW}`, day.kitchen);
    expect(again.json().totals).toEqual(s.totals);
  });

  it('новая покупка добавляет ровно купленное, равенство сохраняется', async () => {
    const day = await makeReportsDay();
    const before = reconcile(day, day.clients.first);
    await buyPaid(day, day.cookies.first, 12);
    const after = reconcile(day, day.clients.first);
    expect(after.journal).toBe(before.journal + 12);
    expect(after.expected).toBe(after.journal);
  });
});
