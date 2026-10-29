import { describe, expect, it } from 'vitest';
import { buyPaid, call, DAY, journalSum, ledgerRows, lotsOf, makeBillingApp } from './helpers.ts';

describe('лоты и журнал: покупка', () => {
  it('пакет на 12 боксов даёт лот с ценой кредита 119 лей и сроком 45 дней, баланс = сумма журнала', async () => {
    const test = await makeBillingApp();
    const purchase = await buyPaid(test, test.client, 12);
    expect(purchase.totalBani).toBe(12 * 11900);

    const [lot, ...rest] = lotsOf(test, test.clientId);
    expect(rest).toEqual([]);
    expect(lot).toMatchObject({
      source: 'purchase',
      credits: 12,
      unit_price_bani: 11900,
      remaining: 12,
    });
    const bought = test.clock.now().getTime();
    expect(Date.parse(lot!.expires_at) - bought).toBe(45 * DAY);

    expect(test.billing.balance(test.clientId)).toBe(12);
    expect(journalSum(test, test.clientId)).toBe(12);
  });
});

describe('резерв, возврат резерва и использование', () => {
  it('резерв списывает с лота, ближайшего к сгоранию, и делит заказ между лотами', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12); // истекает через 45 дней
    test.clock.advance(20 * DAY);
    await buyPaid(test, test.client, 20); // истекает через 65 дней от начала
    const [older, newer] = lotsOf(test, test.clientId);

    const taken = test.billing.reserve(test.clientId, 14, 'order-a');

    expect(taken.map((t) => [t.lotId, t.credits])).toEqual([
      [older!.id, 12],
      [newer!.id, 2],
    ]);
    expect(test.billing.balance(test.clientId)).toBe(18);
    expect(journalSum(test, test.clientId)).toBe(18);
  });

  it('при нехватке кредитов отказ 409 и в журнал ничего не пишется', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    const before = ledgerRows(test, test.clientId).length;

    expect(() => test.billing.reserve(test.clientId, 13, 'order-big')).toThrowError(
      expect.objectContaining({ status: 409, code: 'insufficient_credits' }),
    );
    expect(ledgerRows(test, test.clientId)).toHaveLength(before);
  });

  it('повторный резерв того же заказа не списывает дважды; другое число или чужой пользователь — отказ', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);

    test.billing.reserve(test.clientId, 3, 'order-1');
    test.billing.reserve(test.clientId, 3, 'order-1');
    expect(test.billing.balance(test.clientId)).toBe(9);

    expect(() => test.billing.reserve(test.clientId, 4, 'order-1')).toThrowError(
      expect.objectContaining({ code: 'reservation_exists' }),
    );
    expect(() => test.billing.reserve(test.adminId, 1, 'order-1')).toThrowError(
      expect.objectContaining({ code: 'order_owner_mismatch' }),
    );
    expect(test.billing.balance(test.clientId)).toBe(9);
  });

  it('release возвращает кредиты в те же лоты, повторный release ничего не меняет', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.clock.advance(5 * DAY);
    await buyPaid(test, test.client, 12);
    const lotsBefore = lotsOf(test, test.clientId).map((l) => l.remaining);
    test.billing.reserve(test.clientId, 14, 'order-r');

    expect(test.billing.release('order-r')).toEqual({ released: 14, expired: 0 });
    expect(test.billing.release('order-r')).toEqual({ released: 0, expired: 0 });

    expect(lotsOf(test, test.clientId).map((l) => l.remaining)).toEqual(lotsBefore);
    expect(test.billing.balance(test.clientId)).toBe(24);
    expect(journalSum(test, test.clientId)).toBe(24);
  });

  it('после release заказ можно зарезервировать заново', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.billing.reserve(test.clientId, 2, 'order-m');
    test.billing.release('order-m');
    test.billing.reserve(test.clientId, 5, 'order-m');
    expect(test.billing.balance(test.clientId)).toBe(7);
  });

  it('consume не меняет баланс, повторяется безопасно и закрывает заказ для release', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.billing.reserve(test.clientId, 2, 'order-c');
    const balance = test.billing.balance(test.clientId);

    const first = test.billing.consume('order-c');
    const second = test.billing.consume('order-c');

    expect(first).toMatchObject({ credits: 2, alreadyConsumed: false });
    expect(first.lots).toEqual([expect.objectContaining({ credits: 2, unitPriceBani: 11900 })]);
    expect(second.alreadyConsumed).toBe(true);
    expect(test.billing.balance(test.clientId)).toBe(balance);
    expect(ledgerRows(test, test.clientId).filter((r) => r.reason === 'consume')).toHaveLength(1);
    expect(() => test.billing.release('order-c')).toThrowError(
      expect.objectContaining({ code: 'reservation_consumed' }),
    );
    expect(() => test.billing.reserve(test.clientId, 2, 'order-c')).toThrowError(
      expect.objectContaining({ code: 'reservation_consumed' }),
    );
  });

  it('consume заказа без резерва — отказ', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    expect(() => test.billing.consume('nope')).toThrowError(
      expect.objectContaining({ code: 'nothing_reserved' }),
    );
  });

  it('резерв внутри внешней транзакции откатывается вместе с ней', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    expect(() =>
      test.app.deps.db.tx(() => {
        test.billing.reserve(test.clientId, 4, 'order-tx');
        throw new Error('заказ не удался');
      }),
    ).toThrow('заказ не удался');
    expect(test.billing.balance(test.clientId)).toBe(12);
  });
});

describe('журнал нельзя править', () => {
  it('UPDATE и DELETE записей журнала запрещены, остаток лота в минус не уходит', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    const { db } = test.app.deps;
    const [lot] = lotsOf(test, test.clientId);

    expect(() => db.run('UPDATE credit_ledger SET delta = 99')).toThrow(/append-only/);
    expect(() => db.run('DELETE FROM credit_ledger')).toThrow(/append-only/);
    expect(() =>
      db.run(
        `INSERT INTO credit_ledger (user_id, lot_id, delta, reason, created_at)
         VALUES (?, ?, -13, 'adjustment', '2026-03-10T09:00:00Z')`,
        [test.clientId, lot!.id],
      ),
    ).toThrow(/lot_overdrawn/);
    expect(journalSum(test, test.clientId)).toBe(12);
  });

  it('release не может вернуть больше, чем заказ зарезервировал', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.billing.reserve(test.clientId, 2, 'order-over');
    const [lot] = lotsOf(test, test.clientId);
    expect(() =>
      test.app.deps.db.run(
        `INSERT INTO credit_ledger (user_id, lot_id, delta, reason, order_id, created_at)
         VALUES (?, ?, 3, 'release', 'order-over', '2026-03-10T09:00:00Z')`,
        [test.clientId, lot!.id],
      ),
    ).toThrow(/release_exceeds_reserve/);
  });

  it('API для ручной правки баланса нет', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    const attempts: Array<[string, string]> = [
      ['PUT', '/credits'],
      ['PATCH', '/credits'],
      ['POST', '/credits'],
      ['POST', '/credits/adjust'],
      ['PUT', '/admin/credits'],
      ['POST', '/admin/credits/adjust'],
      ['PATCH', '/admin/balance'],
      ['POST', '/admin/ledger'],
    ];
    for (const [method, url] of attempts) {
      const res = await call(test, method as 'PUT', url, test.admin, {
        delta: 100,
        userId: test.clientId,
      });
      expect([404, 405], `${method} ${url}`).toContain(res.statusCode);
    }
    expect(test.billing.balance(test.clientId)).toBe(12);
  });
});

describe('сгорание лотов', () => {
  it('ночная задача пишет expire один раз и догоняет пропущенные ночи', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.clock.advance(50 * DAY); // три ночи сгорания пропущено

    await test.app.deps.system.scheduler.runNow('billing-expire');
    await test.app.deps.system.scheduler.runNow('billing-expire');

    const expires = ledgerRows(test, test.clientId).filter((r) => r.reason === 'expire');
    expect(expires).toHaveLength(1);
    expect(expires[0]!.delta).toBe(-12);
    expect(journalSum(test, test.clientId)).toBe(0);
    expect(lotsOf(test, test.clientId)[0]!.expired_at).not.toBeNull();
  });

  it('сгоревшие кредиты не резервируются даже до запуска ночной задачи', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.clock.advance(45 * DAY + 1000);

    expect(() => test.billing.reserve(test.clientId, 1, 'order-late')).toThrowError(
      expect.objectContaining({ code: 'insufficient_credits' }),
    );
    expect(test.billing.balance(test.clientId)).toBe(0);
  });

  it('зарезервированные кредиты не сгорают; вернувшиеся в сгоревший лот сгорают сразу', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.billing.reserve(test.clientId, 3, 'order-hold');
    test.clock.advance(46 * DAY);
    test.billing.expireDue();

    const burned = ledgerRows(test, test.clientId).filter((r) => r.reason === 'expire');
    expect(burned.map((r) => r.delta)).toEqual([-9]); // 3 кредита под заказом не тронуты
    expect(test.billing.balance(test.clientId)).toBe(0);

    expect(test.billing.release('order-hold')).toEqual({ released: 0, expired: 3 });
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(journalSum(test, test.clientId)).toBe(0);
    expect(lotsOf(test, test.clientId)[0]!.remaining).toBe(0);
  });
});

describe('кредит по жалобе', () => {
  it('добавляет 1 кредит записью complaint_credit со ссылкой на жалобу; повтор не удваивает', async () => {
    const test = await makeBillingApp();

    const first = test.billing.grantComplaintCredit(test.clientId, 'cmp-7');
    const again = test.billing.grantComplaintCredit(test.clientId, 'cmp-7');

    expect(first.granted).toBe(true);
    expect(again).toEqual({ granted: false, lotId: first.lotId });
    expect(test.billing.balance(test.clientId)).toBe(1);
    const rows = test.app.deps.db.query<{ reason: string; complaint_id: string; delta: number }>(
      'SELECT reason, complaint_id, delta FROM credit_ledger WHERE user_id = ?',
      [test.clientId],
    );
    expect(rows).toEqual([{ reason: 'complaint_credit', complaint_id: 'cmp-7', delta: 1 }]);
    expect(lotsOf(test, test.clientId)[0]).toMatchObject({ source: 'complaint', credits: 1 });
  });

  it('жалоба другого клиента не закрывается чужим кредитом', async () => {
    const test = await makeBillingApp();
    test.billing.grantComplaintCredit(test.clientId, 'cmp-8');
    expect(() => test.billing.grantComplaintCredit(test.adminId, 'cmp-8')).toThrow();
  });
});

describe('уведомление за 7 дней до сгорания', () => {
  it('создаётся один раз на лот и не раньше чем за 7 дней', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    const jobs = test.app.deps.system.scheduler;
    const notes = () =>
      test.app.deps.db.query<{ payload: string }>(
        "SELECT payload FROM notifications WHERE user_id = ? AND type = 'credits_expiring'",
        [test.clientId],
      );

    test.clock.advance(37 * DAY); // до сгорания 8 дней
    await jobs.runNow('billing-expire');
    expect(notes()).toHaveLength(0);

    test.clock.advance(1 * DAY); // 7 дней
    await jobs.runNow('billing-expire');
    await jobs.runNow('billing-expire');
    test.clock.advance(2 * DAY);
    await jobs.runNow('billing-expire');

    expect(notes()).toHaveLength(1);
    expect(JSON.parse(notes()[0]!.payload)).toMatchObject({ count: 12, link: '/packages' });
  });

  it('пропущенную ночь догоняет следующий запуск; сгоревшему лоту уведомление не нужно', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    const jobs = test.app.deps.system.scheduler;

    test.clock.advance(28 * DAY);
    const second = await buyPaid(test, test.client, 1); // второй лот сгорит на 28 дней позже
    expect(second.status).toBe('paid');
    test.clock.advance(13 * DAY); // у первого осталось 4 дня, задача в эти ночи не запускалась
    await jobs.runNow('billing-expire');
    const count = () =>
      test.app.deps.db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM notifications WHERE type = 'credits_expiring'",
      )!.n;
    expect(count()).toBe(1);

    test.clock.advance(5 * DAY); // первый лот сгорел, у второго ещё больше недели
    await jobs.runNow('billing-expire');
    expect(count()).toBe(1);
  });
});
