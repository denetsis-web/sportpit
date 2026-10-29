import { describe, expect, it } from 'vitest';
import {
  DAY,
  gatewayCallback,
  providerPaymentIdOf,
  journalSum,
  ledgerRows,
  lotsOf,
  makeBillingApp,
  newKey,
  packageId,
  type BillingTest,
} from './helpers.ts';

/** Покупка напрямую через сервис: сессии клиента живут 30 дней, а сценарии длиннее. */
async function buyDirect(test: BillingTest, boxes: number) {
  const { purchase } = await test.billing.startPurchase(test.clientId, {
    packageId: packageId(test, boxes),
    method: 'card',
    idempotencyKey: newKey(),
  });
  expect(purchase.status).toBe('paid');
  return purchase;
}

const carryLots = (test: BillingTest) =>
  lotsOf(test, test.clientId).filter((l) => l.source === 'carryover');

describe('перенос кредитов при покупке нового пакета (R42)', () => {
  it('переносит не более 4 кредитов из лота, истёкшего недавно, записью carryover', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 12);
    test.billing.reserve(test.clientId, 3, 'o-1');
    test.billing.consume('o-1'); // 3 использовано, 9 останется неиспользованными
    test.clock.advance(50 * DAY); // лот сгорел 5 дней назад

    const purchase = await buyDirect(test, 12);

    expect(purchase.carriedOver).toBe(4);
    const [carry] = carryLots(test);
    const lots = lotsOf(test, test.clientId);
    expect(carry).toMatchObject({ credits: 4, remaining: 4, unit_price_bani: 11900 });
    // срок перенесённых кредитов совпадает со сроком нового пакета
    expect(carry!.expires_at).toBe(
      lots.find((l) => l.source === 'purchase' && l.id !== lots[0]!.id)!.expires_at,
    );
    const entry = ledgerRows(test, test.clientId).find((r) => r.reason === 'carryover');
    expect(entry).toMatchObject({ delta: 4, lot_id: carry!.id });
    expect(test.billing.balance(test.clientId)).toBe(16);
    expect(journalSum(test, test.clientId)).toBe(16);
  });

  it('если сгорело меньше 4 — переносится всё сгоревшее', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 12);
    test.billing.reserve(test.clientId, 10, 'o-2');
    test.billing.consume('o-2'); // осталось 2
    test.clock.advance(46 * DAY);

    const purchase = await buyDirect(test, 12);
    expect(purchase.carriedOver).toBe(2);
    expect(test.billing.balance(test.clientId)).toBe(14);
  });

  it('лимит 4 действует на всю покупку, даже если сгорело несколько лотов', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 1); // сгорит первым
    test.clock.advance(1 * DAY);
    await buyDirect(test, 12);
    test.clock.advance(50 * DAY);

    const purchase = await buyDirect(test, 12);

    expect(purchase.carriedOver).toBe(4);
    // сначала берётся лот, который сгорел раньше: 1 кредит из него и 3 из следующего
    expect(carryLots(test).map((l) => l.credits)).toEqual([1, 3]);
  });

  it('окно 45 дней: давно сгоревшее не переносится', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 12); // сгорает на 45-й день
    test.clock.advance(95 * DAY); // с момента сгорания прошло 50 дней
    expect((await buyDirect(test, 12)).carriedOver).toBe(0);
    expect(carryLots(test)).toHaveLength(0);
  });

  it('окно 45 дней: сгоревшее 40 дней назад ещё переносится', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 12);
    test.clock.advance(85 * DAY);
    expect((await buyDirect(test, 12)).carriedOver).toBe(4);
  });

  it('перенесённый лот сам не переносится; исходный лот не переносится сверх сгоревшего', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 1); // лот A: 1 кредит, сгорит на 45-й день
    test.clock.advance(46 * DAY);
    expect((await buyDirect(test, 1)).carriedOver).toBe(1); // лот B; из A перенесён 1 → лот C
    expect((await buyDirect(test, 1)).carriedOver).toBe(0); // лот D; из A уже всё перенесено

    const [lotA, lotB, lotC, lotD] = lotsOf(test, test.clientId);
    expect(lotC!.source).toBe('carryover');

    test.clock.advance(46 * DAY); // B, C и D сгорели
    const last = await buyDirect(test, 12);

    // переносятся B и D по 1 кредиту; C (сам перенесённый) — нет
    expect(last.carriedOver).toBe(2);
    const origins = test.app.deps.db
      .query<{ origin_lot_id: number }>(
        'SELECT origin_lot_id FROM credit_lots WHERE origin_lot_id IS NOT NULL ORDER BY id',
      )
      .map((r) => r.origin_lot_id);
    expect(origins).toEqual([lotA!.id, lotB!.id, lotD!.id]);
    expect(journalSum(test, test.clientId)).toBe(test.billing.balance(test.clientId));
  });

  it('кредиты, вернувшиеся в уже сгоревший лот при отмене заказа, тоже можно перенести', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 12);
    test.billing.reserve(test.clientId, 12, 'o-held'); // всё под заказом
    test.clock.advance(46 * DAY);
    test.billing.expireDue();
    expect(test.billing.release('o-held')).toEqual({ released: 0, expired: 12 });

    const purchase = await buyDirect(test, 12);
    expect(purchase.carriedOver).toBe(4);
  });

  it('нечего переносить — записи carryover нет', async () => {
    const test = await makeBillingApp();
    await buyDirect(test, 12);
    test.billing.reserve(test.clientId, 12, 'o-all');
    test.billing.consume('o-all');
    test.clock.advance(46 * DAY);

    expect((await buyDirect(test, 12)).carriedOver).toBe(0);
    expect(ledgerRows(test, test.clientId).filter((r) => r.reason === 'carryover')).toEqual([]);
  });

  it('перенос происходит при оплате, а не при создании покупки, и не повторяется при двойном колбэке', async () => {
    const test = await makeBillingApp({ outcome: 'pending' });
    test.billing.grantComplaintCredit(test.clientId, 'c-1'); // лот на 1 кредит, сгорит
    test.clock.advance(46 * DAY);
    const { purchase } = await test.billing.startPurchase(test.clientId, {
      packageId: packageId(test, 12),
      method: 'card',
      idempotencyKey: newKey(),
    });
    expect(purchase.status).toBe('pending');
    expect(carryLots(test)).toHaveLength(0);
    expect(test.billing.balance(test.clientId)).toBe(0);

    const paymentId = providerPaymentIdOf(test, purchase.id);
    test.stub.complete(paymentId, 'paid');
    await gatewayCallback(test, paymentId);
    await gatewayCallback(test, paymentId);

    expect(carryLots(test).map((l) => l.credits)).toEqual([1]);
    expect(test.billing.balance(test.clientId)).toBe(13);
  });
});
