import { describe, expect, it } from 'vitest';
import {
  buy,
  buyPaid,
  call,
  DAY,
  gatewayCallback,
  journalSum,
  ledgerRows,
  makeBillingApp,
  newKey,
  packageId,
  providerPaymentIdOf,
} from './helpers.ts';

const pendingApp = () => makeBillingApp({ outcome: 'pending' });

describe('покупка: ожидание, оплачено, отклонено', () => {
  it('платёж в ожидании: кредитов нет, клиента ведут на страницу заглушки', async () => {
    const test = await pendingApp();
    const { res, body } = await buy(test, test.client, 12);

    expect(res.statusCode).toBe(201);
    expect(body.purchase).toMatchObject({
      status: 'pending',
      failureCode: null,
      totalBani: 12 * 11900,
      stubGateway: true,
    });
    expect(body.purchase.redirectUrl).toBe(`/pay/stub/${body.purchase.id}`);
    expect(test.billing.balance(test.clientId)).toBe(0);
  });

  it('колбэк «оплачено» зачисляет кредиты один раз, статус виден запросом', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 20);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);

    test.stub.complete(paymentId, 'paid');
    const callback = await gatewayCallback(test, paymentId);

    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toMatchObject({ ok: true, duplicate: false });
    const status = await call(test, 'GET', `/purchases/${body.purchase.id}`, test.client);
    expect(status.json().purchase).toMatchObject({ status: 'paid', redirectUrl: null });
    expect(test.billing.balance(test.clientId)).toBe(20);
    expect(journalSum(test, test.clientId)).toBe(20);
  });

  it('отказ: кредиты не зачисляются, причина видна, повтор создаёт новую попытку', async () => {
    const test = await pendingApp();
    const first = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, first.body.purchase.id);
    test.stub.complete(paymentId, 'failed', 'Недостаточно средств');
    await gatewayCallback(test, paymentId);

    const failed = await call(test, 'GET', `/purchases/${first.body.purchase.id}`, test.client);
    expect(failed.json().purchase).toMatchObject({
      status: 'failed',
      failureCode: 'declined',
      failureReason: 'Недостаточно средств',
    });
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(ledgerRows(test, test.clientId)).toEqual([]);

    // повтор с новым ключом — новая попытка, старая остаётся failed
    test.stub.setOutcome('paid');
    const retry = await buy(test, test.client, 12);
    expect(retry.body.purchase.id).not.toBe(first.body.purchase.id);
    expect(retry.body.purchase.status).toBe('paid');
    expect(test.billing.balance(test.clientId)).toBe(12);
    const statuses = test.app.deps.db
      .query<{ status: string }>('SELECT status FROM purchases ORDER BY id')
      .map((r) => r.status);
    expect(statuses).toEqual(['failed', 'paid']);
  });

  it('отказ пишет событие payment_failed', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);
    test.stub.complete(paymentId, 'failed');
    await gatewayCallback(test, paymentId);

    const events = test.app.deps.system.events.list({ kind: 'payment_failed' });
    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toMatchObject({ purchaseId: body.purchase.id, code: 'declined' });
  });

  it('шлюз недоступен: покупка failed/error, кредитов нет, событие записано один раз', async () => {
    const test = await pendingApp();
    test.stub.failNext();
    const { res, body } = await buy(test, test.client, 12);

    expect(res.statusCode).toBe(201);
    expect(body.purchase).toMatchObject({ status: 'failed', failureCode: 'error' });
    expect(test.billing.balance(test.clientId)).toBe(0);
    expect(test.app.deps.system.events.list({ kind: 'payment_failed' })).toHaveLength(1);
  });

  it('пользователь отменил оплату: failed/cancelled, промокод освобождается', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const res = await call(test, 'POST', `/purchases/${body.purchase.id}/cancel`, test.client);
    expect(res.json().purchase).toMatchObject({ status: 'failed', failureCode: 'cancelled' });
    expect(test.billing.balance(test.clientId)).toBe(0);
  });

  it('отмена не отменяет уже принятый шлюзом платёж', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    test.stub.complete(providerPaymentIdOf(test, body.purchase.id), 'paid'); // колбэк потерялся
    const res = await call(test, 'POST', `/purchases/${body.purchase.id}/cancel`, test.client);
    expect(res.json().purchase.status).toBe('paid');
    expect(test.billing.balance(test.clientId)).toBe(12);
  });

  it('ожидающая покупка старше 30 минут закрывается как expired; поздний «оплачено» всё равно зачисляется', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);

    test.clock.advance(31 * 60_000);
    await test.app.deps.system.scheduler.runNow('billing-pending');
    const expired = await call(test, 'GET', `/purchases/${body.purchase.id}`, test.client);
    expect(expired.json().purchase).toMatchObject({ status: 'failed', failureCode: 'expired' });
    expect(test.billing.balance(test.clientId)).toBe(0);

    // деньги всё-таки пришли: шлюз — источник истины, кредиты зачисляются ровно один раз
    test.stub.complete(paymentId, 'paid');
    await gatewayCallback(test, paymentId);
    await gatewayCallback(test, paymentId);
    expect(test.billing.balance(test.clientId)).toBe(12);
    const paid = await call(test, 'GET', `/purchases/${body.purchase.id}`, test.client);
    expect(paid.json().purchase).toMatchObject({ status: 'paid', failureCode: null });
  });

  it('потерянный колбэк: опрос статуса сверяется со шлюзом', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    test.stub.complete(providerPaymentIdOf(test, body.purchase.id), 'paid');
    test.clock.advance(31_000); // не чаще раза в 30 секунд

    const status = await call(test, 'GET', `/purchases/${body.purchase.id}`, test.client);
    expect(status.json().purchase.status).toBe('paid');
    expect(test.billing.balance(test.clientId)).toBe(12);
  });
});

describe('идемпотентность денег', () => {
  it('двойное нажатие «оплатить» (тот же ключ) даёт одну покупку и один платёж', async () => {
    const test = await pendingApp();
    const key = newKey();
    const [a, b] = await Promise.all([
      buy(test, test.client, 12, { idempotencyKey: key }),
      buy(test, test.client, 12, { idempotencyKey: key }),
    ]);

    expect(a.body.purchase.id).toBe(b.body.purchase.id);
    expect([a.res.statusCode, b.res.statusCode].sort()).toEqual([200, 201]);
    expect(test.app.deps.db.query('SELECT 1 FROM purchases')).toHaveLength(1);
    expect(test.stub.payments.size).toBe(1);
  });

  it('двойное нажатие при мгновенной оплате не зачисляет дважды', async () => {
    const test = await makeBillingApp({ outcome: 'paid' });
    const key = newKey();
    const results = await Promise.all([
      buy(test, test.client, 20, { idempotencyKey: key }),
      buy(test, test.client, 20, { idempotencyKey: key }),
      buy(test, test.client, 20, { idempotencyKey: key }),
    ]);

    expect(new Set(results.map((r) => r.body.purchase.id)).size).toBe(1);
    expect(test.billing.balance(test.clientId)).toBe(20);
    expect(journalSum(test, test.clientId)).toBe(20);
    expect(ledgerRows(test, test.clientId).filter((r) => r.reason === 'purchase')).toHaveLength(1);
  });

  it('тот же ключ с другим пакетом — 409', async () => {
    const test = await pendingApp();
    const key = newKey();
    await buy(test, test.client, 12, { idempotencyKey: key });
    const other = await buy(test, test.client, 30, { idempotencyKey: key });
    expect(other.res.statusCode).toBe(409);
    expect(other.res.json().error.code).toBe('idempotency_conflict');
  });

  it('ключ одного клиента не пересекается с ключом другого', async () => {
    const test = await pendingApp();
    const key = newKey();
    const mine = await buy(test, test.client, 12, { idempotencyKey: key });
    const theirs = await buy(test, test.admin, 12, { idempotencyKey: key });
    expect(theirs.body.purchase.id).not.toBe(mine.body.purchase.id);
  });

  it('повторный колбэк шлюза (тот же eventId) не меняет баланс', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);
    test.stub.complete(paymentId, 'paid');

    const results = await Promise.all([
      gatewayCallback(test, paymentId),
      gatewayCallback(test, paymentId),
      gatewayCallback(test, paymentId),
    ]);

    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.json().duplicate === false)).toHaveLength(1);
    expect(test.billing.balance(test.clientId)).toBe(12);
    expect(
      test.app.deps.db.query('SELECT 1 FROM credit_lots WHERE purchase_id = ?', [body.purchase.id]),
    ).toHaveLength(1);
    expect(test.app.deps.db.query('SELECT 1 FROM payment_events')).toHaveLength(1);
  });

  it('другой eventId на ту же оплату тоже не зачисляет повторно', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);
    test.stub.complete(paymentId, 'paid');
    await gatewayCallback(test, paymentId);
    test.stub.complete(paymentId, 'paid'); // новый eventId
    const second = await gatewayCallback(test, paymentId);

    expect(second.json().duplicate).toBe(false);
    expect(test.billing.balance(test.clientId)).toBe(12);
  });

  it('отказ после оплаты не отнимает кредиты и не меняет статус', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);
    test.stub.complete(paymentId, 'paid');
    await gatewayCallback(test, paymentId);
    test.stub.complete(paymentId, 'failed');
    await gatewayCallback(test, paymentId);

    const status = await call(test, 'GET', `/purchases/${body.purchase.id}`, test.client);
    expect(status.json().purchase.status).toBe('paid');
    expect(test.billing.balance(test.clientId)).toBe(12);
  });
});

describe('колбэк шлюза: защита', () => {
  it('неверная подпись — 400, ничего не меняется', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);
    test.stub.complete(paymentId, 'paid');

    const res = await test.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/payment',
      headers: { 'x-stub-signature': 'forged' },
      payload: test.stub.callbackFor(paymentId).body as object,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_callback');
    expect(test.billing.balance(test.clientId)).toBe(0);
  });

  it('неизвестный платёж — 404, чтобы шлюз повторил позже', async () => {
    const test = await pendingApp();
    const res = await test.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/payment',
      headers: { 'x-stub-signature': 'stub' },
      payload: { providerPaymentId: 'stub_unknown', status: 'paid', eventId: 'e1' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('колбэк принимается без X-Requested-With (его шлёт банк, а не браузер)', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const paymentId = providerPaymentIdOf(test, body.purchase.id);
    test.stub.complete(paymentId, 'paid');
    // помощник gatewayCallback не ставит заголовок X-Requested-With, как и банк
    const res = await gatewayCallback(test, paymentId);
    expect(res.statusCode).toBe(200);
  });
});

describe('страница заглушки шлюза', () => {
  it('«Оплатить» проходит путь настоящего колбэка; повторное нажатие безопасно', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const pay = () =>
      call(test, 'POST', `/purchases/${body.purchase.id}/stub-pay`, test.client, {
        outcome: 'paid',
      });

    const first = await pay();
    const second = await pay();

    expect(first.json().purchase.status).toBe('paid');
    expect(second.json().purchase.status).toBe('paid');
    expect(test.billing.balance(test.clientId)).toBe(12);
  });

  it('«Отклонить» даёт failed/declined без кредитов', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const res = await call(test, 'POST', `/purchases/${body.purchase.id}/stub-pay`, test.client, {
      outcome: 'failed',
    });
    expect(res.json().purchase).toMatchObject({ status: 'failed', failureCode: 'declined' });
    expect(test.billing.balance(test.clientId)).toBe(0);
  });

  it('чужую покупку оплатить нельзя', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    const res = await call(test, 'POST', `/purchases/${body.purchase.id}/stub-pay`, test.admin, {
      outcome: 'paid',
    });
    expect(res.statusCode).toBe(404);
    expect(test.billing.balance(test.clientId)).toBe(0);
  });
});

describe('доступ и данные карты', () => {
  it('без входа покупка и баланс недоступны, список пакетов открыт', async () => {
    const test = await pendingApp();
    expect((await call(test, 'GET', '/credits')).statusCode).toBe(401);
    expect((await call(test, 'POST', '/purchases')).statusCode).toBe(401);
    expect((await call(test, 'GET', '/packages')).statusCode).toBe(200);
  });

  it('чужая покупка читается как «не найдено»', async () => {
    const test = await pendingApp();
    const { body } = await buy(test, test.client, 12);
    expect((await call(test, 'GET', `/purchases/${body.purchase.id}`, test.admin)).statusCode).toBe(
      404,
    );
  });

  it('поля с данными карты не принимаются и не сохраняются', async () => {
    const test = await pendingApp();
    const res = await call(test, 'POST', '/purchases', test.client, {
      packageId: packageId(test, 12),
      method: 'card',
      idempotencyKey: newKey(),
      cardNumber: '4111111111111111',
      cvv: '123',
    });
    expect(res.statusCode).toBe(201);
    const dump = JSON.stringify(test.app.deps.db.query('SELECT * FROM purchases')).concat(res.body);
    expect(dump).not.toContain('4111');
    expect(dump).not.toContain('cvv');
    // шлюзу уходит только сумма, способ и наши номера
    const sent = [...test.stub.payments.values()][0]!.request;
    expect(Object.keys(sent).sort()).toEqual(
      [
        'amountBani',
        'currency',
        'description',
        'idempotencyKey',
        'method',
        'reference',
        'returnUrl',
      ].sort(),
    );
  });

  it('в базе нет колонок и таблиц для данных карты', async () => {
    const test = await pendingApp();
    const columns = test.app.deps.db
      .query<{ name: string }>(
        "SELECT m.name || '.' || p.name AS name FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table'",
      )
      .map((r) => r.name);
    expect(columns.filter((c) => /card|pan|cvv|cvc|expiry_date/i.test(c.split('.')[1]!))).toEqual(
      [],
    );
  });

  it('автопродления нет: ни маршрутов подписки, ни повторных платежей', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12);
    test.clock.advance(100 * DAY);
    await test.app.deps.system.scheduler.runNow('billing-expire');
    await test.app.deps.system.scheduler.runNow('billing-pending');
    expect(test.stub.payments.size).toBe(1);
    expect(test.app.deps.db.query('SELECT 1 FROM purchases')).toHaveLength(1);
    const jobs = test.app.deps.system.scheduler.list().map((j) => j.name);
    expect(jobs.filter((n) => /renew|subscri|recurr/i.test(n))).toEqual([]);
  });
});
