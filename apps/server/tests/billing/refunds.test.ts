import { describe, expect, it } from 'vitest';
import {
  buy,
  buyPaid,
  call,
  DAY,
  freshAdmin,
  journalSum,
  ledgerRows,
  makeBillingApp,
  type BillingTest,
} from './helpers.ts';

const refund = (test: BillingTest, body: Record<string, unknown>, cookie = test.admin) =>
  call(test, 'POST', '/admin/refunds', cookie, body);

/** 12 боксов по 119 лей, 2 из них заказаны и использованы. */
async function boughtAndUsed(test: BillingTest, used = 2) {
  const purchase = await buyPaid(test, test.client, 12);
  if (used > 0) {
    test.billing.reserve(test.clientId, used, 'order-used');
    test.billing.consume('order-used');
  }
  return purchase;
}

describe('возврат: неиспользованные кредиты × цена кредита лота', () => {
  it('по умолчанию возвращает все неиспользованные: деньги, запись журнала, команда шлюзу', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);

    const res = await refund(test, { purchaseId: purchase.id, reason: 'клиент переехал' });

    expect(res.statusCode).toBe(201);
    expect(res.json().refund).toMatchObject({
      purchaseId: purchase.id,
      credits: 10,
      amountBani: 119000, // 10 × 119 лей
      reason: 'клиент переехал',
      status: 'done',
    });
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(journalSum(test, test.clientId)).toBe(0);
    const entry = ledgerRows(test, test.clientId).find((r) => r.reason === 'refund');
    expect(entry).toMatchObject({ delta: -10, memo: 'клиент переехал' });
    expect(test.stub.refunds).toHaveLength(1);
    expect(test.stub.refunds[0]).toMatchObject({ amountBani: 119000, reason: 'клиент переехал' });
  });

  it('частичный возврат: 4 кредита × 119 лей', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);

    const res = await refund(test, {
      purchaseId: purchase.id,
      credits: 4,
      reason: 'часть боксов не нужна',
    });

    expect(res.json().refund).toMatchObject({ credits: 4, amountBani: 47600 });
    expect(test.billing.balance(test.clientId)).toBe(6);
    expect(test.stub.refunds[0]!.amountBani).toBe(47600);
  });

  it('цена кредита берётся из лота покупки, а не из текущего пакета и не из полной цены при скидке', async () => {
    const test = await makeBillingApp();
    await call(test, 'POST', '/admin/promos', test.admin, {
      code: 'HALF',
      kind: 'percent',
      value: 50,
    });
    const purchase = await buyPaid(test, test.client, 12, { promoCode: 'HALF' });
    expect(purchase.unitPriceBani).toBe(5950);
    // цена пакета потом выросла — на возврат это не влияет
    const pkg = test.app.deps.db.get<{ id: number }>('SELECT id FROM packages WHERE boxes = 12')!;
    await call(test, 'PATCH', `/admin/packages/${pkg.id}`, test.admin, { pricePerBoxBani: 20000 });

    const res = await refund(test, {
      purchaseId: purchase.id,
      credits: 12,
      reason: 'отказ от пакета',
    });

    expect(res.json().refund.amountBani).toBe(12 * 5950);
  });

  it('больше неиспользованного вернуть нельзя: 409, журнал и шлюз не тронуты', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);
    const before = ledgerRows(test, test.clientId).length;

    const res = await refund(test, {
      purchaseId: purchase.id,
      credits: 11,
      reason: 'слишком много',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('refund_exceeds_unused');
    expect(res.json().error.message).toContain('10');
    expect(ledgerRows(test, test.clientId)).toHaveLength(before);
    expect(test.stub.refunds).toHaveLength(0);
    expect(test.app.deps.db.query('SELECT 1 FROM refunds')).toHaveLength(0);
  });

  it('зарезервированные под заказ кредиты возврату не подлежат', async () => {
    const test = await makeBillingApp();
    const purchase = await buyPaid(test, test.client, 12);
    test.billing.reserve(test.clientId, 12, 'order-all');

    const res = await refund(test, { purchaseId: purchase.id, reason: 'все в заказах' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('nothing_to_refund');
  });

  it('повторный возврат после полного — отказ; две одновременные команды дают один возврат', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);

    const [a, b] = await Promise.all([
      refund(test, { purchaseId: purchase.id, reason: 'двойной клик' }),
      refund(test, { purchaseId: purchase.id, reason: 'двойной клик' }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(test.stub.refunds).toHaveLength(1);
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(journalSum(test, test.clientId)).toBe(0);
    expect(
      (await refund(test, { purchaseId: purchase.id, reason: 'ещё раз' })).json().error.code,
    ).toBe('nothing_to_refund');
  });

  it('сгоревшие кредиты не возвращаются деньгами', async () => {
    const test = await makeBillingApp();
    const purchase = await buyPaid(test, test.client, 12);
    test.clock.advance(46 * DAY);
    const res = await refund(
      test,
      { purchaseId: purchase.id, reason: 'поздно' },
      await freshAdmin(test),
    );
    expect(res.json().error.code).toBe('nothing_to_refund');
  });

  it('неоплаченная покупка и покупка на 0 лей не возвращаются', async () => {
    const test = await makeBillingApp({ outcome: 'pending' });
    const pending = await buy(test, test.client, 12);
    expect(
      (await refund(test, { purchaseId: pending.body.purchase.id, reason: 'не оплачено' })).json()
        .error.code,
    ).toBe('refund_not_possible');
    await call(test, 'POST', '/admin/promos', test.admin, {
      code: 'FREE100',
      kind: 'percent',
      value: 100,
    });
    const free = await buy(test, test.client, 12, { promoCode: 'FREE100' });
    expect(free.body.purchase.status).toBe('paid');
    expect(
      (await refund(test, { purchaseId: free.body.purchase.id, reason: 'бесплатный' })).json().error
        .code,
    ).toBe('refund_not_possible');
    expect((await refund(test, { purchaseId: 9999, reason: 'нет такой' })).statusCode).toBe(404);
  });
});

describe('сбои шлюза при возврате', () => {
  it('шлюз отказал: кредиты возвращаются компенсирующей записью с причиной, возврат failed', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);
    test.stub.refund = async () => ({ providerRefundId: 'x', status: 'failed' });

    const res = await refund(test, {
      purchaseId: purchase.id,
      credits: 5,
      reason: 'проверка отказа',
    });

    expect(res.json().refund).toMatchObject({
      status: 'failed',
      failureDetail: 'gateway_declined',
    });
    expect(test.billing.balance(test.clientId)).toBe(10);
    const rows = ledgerRows(test, test.clientId).filter((r) =>
      ['refund', 'adjustment'].includes(r.reason),
    );
    expect(rows.map((r) => [r.reason, r.delta])).toEqual([
      ['refund', -5],
      ['adjustment', 5],
    ]);
    expect(rows[1]!.memo).toBe('refund_failed');
    expect(journalSum(test, test.clientId)).toBe(10);
    expect(test.app.deps.system.events.list({ kind: 'payment_failed' })).toHaveLength(1);
  });

  it('шлюз не ответил: возврат ждёт, кредиты списаны; повтор отправляет ту же команду и не возвращает дважды', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);
    test.stub.failNext();

    const first = await refund(test, { purchaseId: purchase.id, reason: 'шлюз упал' });

    expect(first.statusCode).toBe(201);
    expect(first.json().refund).toMatchObject({
      status: 'pending',
      failureDetail: 'gateway_error',
    });
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(test.stub.refunds).toHaveLength(0);

    const id = first.json().refund.id;
    const retry = await call(test, 'POST', `/admin/refunds/${id}/retry`, test.admin);
    const again = await call(test, 'POST', `/admin/refunds/${id}/retry`, test.admin);

    expect(retry.json().refund.status).toBe('done');
    expect(again.json().refund.status).toBe('done');
    expect(test.stub.refunds).toHaveLength(1); // второй retry уже ничего не отправляет
    expect(journalSum(test, test.clientId)).toBe(0);
    expect(test.billing.balance(test.clientId)).toBe(0);
  });

  it('отказ шлюза для лота, который успел сгореть, не создаёт доступных кредитов', async () => {
    const test = await makeBillingApp();
    const purchase = await buyPaid(test, test.client, 12);
    test.stub.failNext();
    const first = await refund(test, { purchaseId: purchase.id, credits: 5, reason: 'шлюз упал' });
    test.clock.advance(46 * DAY);
    test.billing.expireDue();
    test.stub.refund = async () => ({ providerRefundId: 'x', status: 'failed' });

    const retry = await call(
      test,
      'POST',
      `/admin/refunds/${first.json().refund.id}/retry`,
      await freshAdmin(test),
    );

    expect(retry.json().refund.status).toBe('failed');
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(journalSum(test, test.clientId)).toBe(0);
  });
});

describe('возвраты в админке', () => {
  it('нужна причина и роль администратора', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);

    const noReason = await refund(test, { purchaseId: purchase.id, reason: ' ' });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().error.fields.reason).toBe('billing.error.refundReason');
    expect(
      (await refund(test, { purchaseId: purchase.id, reason: 'клиент' }, test.client)).statusCode,
    ).toBe(403);
    expect(test.stub.refunds).toHaveLength(0);
  });

  it('список покупок показывает неиспользованное и сумму к возврату; список возвратов — историю', async () => {
    const test = await makeBillingApp();
    const purchase = await boughtAndUsed(test);
    await refund(test, { purchaseId: purchase.id, credits: 4, reason: 'часть' });

    const list = await call(test, 'GET', '/admin/purchases', test.admin);
    expect(list.json().items[0]).toMatchObject({
      id: purchase.id,
      userPhone: '+37369876543',
      unusedCredits: 6,
      refundableBani: 6 * 11900,
      refundedBani: 4 * 11900,
    });
    const found = await call(test, 'GET', '/admin/purchases?q=69876', test.admin);
    expect(found.json().items).toHaveLength(1);
    expect(
      (await call(test, 'GET', '/admin/purchases?q=00000', test.admin)).json().items,
    ).toHaveLength(0);

    const history = await call(test, 'GET', '/admin/refunds', test.admin);
    expect(history.json().items).toEqual([
      expect.objectContaining({
        credits: 4,
        amountBani: 47600,
        status: 'done',
        userPhone: '+37369876543',
      }),
    ]);
  });
});
