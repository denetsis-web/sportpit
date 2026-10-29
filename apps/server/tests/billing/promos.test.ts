import { describe, expect, it } from 'vitest';
import {
  addClient,
  buy,
  buyPaid,
  call,
  lotsOf,
  makeBillingApp,
  packageId,
  providerPaymentIdOf,
  gatewayCallback,
  type BillingTest,
} from './helpers.ts';

async function createPromo(test: BillingTest, body: Record<string, unknown>) {
  const res = await call(test, 'POST', '/admin/promos', test.admin, body);
  if (res.statusCode !== 201) throw new Error(`Промокод не создан: ${res.statusCode} ${res.body}`);
  return res.json().promo as { id: number; code: string };
}

const apply = (
  test: BillingTest,
  cookie: string,
  code: string,
  extra: Record<string, unknown> = {},
  lang = 'ru',
) => call(test, 'POST', '/promo/apply', cookie, { code, ...extra }, { 'accept-language': lang });

describe('скидки по промокоду', () => {
  it('процент: цена кредита округляется к бане, итог = цена × боксы, скидка записана', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'FIT15', kind: 'percent', value: 15 });

    const { body } = await buy(test, test.client, 12, { promoCode: 'fit15' });

    // 11900 × 0,85 = 10115 за бокс; 12 боксов = 121 380; скидка 12 × 1785 = 21 420
    expect(body.purchase).toMatchObject({
      status: 'paid',
      unitPriceBani: 10115,
      totalBani: 121380,
      discountBani: 21420,
      promoCode: 'FIT15',
    });
    expect(lotsOf(test, test.clientId)[0]).toMatchObject({ unit_price_bani: 10115 });
  });

  it('фиксированная сумма делится на боксы с округлением вниз', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'MINUS50', kind: 'fixed', value: 5000 });

    const twenty = await buy(test, test.client, 20, { promoCode: 'MINUS50' });
    // 5000 / 20 = 250 с каждого бокса: 10900 − 250 = 10650
    expect(twenty.body.purchase).toMatchObject({ unitPriceBani: 10650, totalBani: 213000 });

    const other = await addClient(test);
    const twelve = await buy(test, other.cookie, 12, { promoCode: 'MINUS50' });
    // 5000 / 12 = 416 (остаток 8 бань остаётся магазину): 11900 − 416 = 11484
    expect(twelve.body.purchase).toMatchObject({ unitPriceBani: 11484, totalBani: 137808 });
  });

  it('скидка не уходит ниже нуля; покупка на 0 лей зачисляется без шлюза', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'ALLFREE', kind: 'percent', value: 100 });

    const { body } = await buy(test, test.client, 12, { promoCode: 'ALLFREE' });

    expect(body.purchase).toMatchObject({ status: 'paid', totalBani: 0, unitPriceBani: 0 });
    expect(test.billing.balance(test.clientId)).toBe(12);
    expect(test.stub.payments.size).toBe(0);
  });

  it('предпросмотр: /promo/apply с пакетом показывает итог и ничего не расходует', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'PREVIEW', kind: 'percent', value: 10, maxUses: 1 });

    const res = await apply(test, test.client, 'preview', { packageId: packageId(test, 30) });

    expect(res.json()).toMatchObject({
      kind: 'percent',
      unitPriceBani: 8910,
      totalBani: 267300,
      discountBani: 29700,
      creditsGranted: 0,
    });
    expect(test.app.deps.db.query('SELECT 1 FROM promo_redemptions')).toHaveLength(0);
    // после предпросмотра код всё ещё можно использовать
    expect((await buy(test, test.client, 30, { promoCode: 'PREVIEW' })).body.purchase.status).toBe(
      'paid',
    );
  });

  it('бесплатные кредиты зачисляются сразу отдельным лотом без цены, второй раз — отказ', async () => {
    const test = await makeBillingApp();
    await createPromo(test, {
      code: 'TRIAL3',
      kind: 'free_credits',
      value: 3,
      ownerLabel: 'Тренер Иван',
    });

    const res = await apply(test, test.client, 'TRIAL3');

    expect(res.json()).toMatchObject({ kind: 'free_credits', creditsGranted: 3 });
    expect(test.billing.balance(test.clientId)).toBe(3);
    expect(lotsOf(test, test.clientId)[0]).toMatchObject({
      source: 'promo',
      credits: 3,
      unit_price_bani: 0,
    });

    const again = await apply(test, test.client, 'TRIAL3');
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('promo_used');
    expect(test.billing.balance(test.clientId)).toBe(3);
  });

  it('промокод на бесплатные кредиты нельзя приложить к покупке пакета', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'TRIAL2', kind: 'free_credits', value: 2 });
    const { res } = await buy(test, test.client, 12, { promoCode: 'TRIAL2' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('promo_free_credits');
    expect(test.app.deps.db.query('SELECT 1 FROM purchases')).toHaveLength(0);
  });
});

describe('проверки промокода', () => {
  it('срок: границы включительно по календарным дням Кишинёва', async () => {
    // 2026-03-10 09:00Z = 11:00 в Кишинёве
    const test = await makeBillingApp();
    await createPromo(test, {
      code: 'WINDOW',
      kind: 'percent',
      value: 10,
      validFrom: '2026-03-10',
      validUntil: '2026-03-10',
    });

    expect(
      (await apply(test, test.client, 'WINDOW', { packageId: packageId(test, 12) })).statusCode,
    ).toBe(200);

    test.clock.set('2026-03-10T21:59:00Z'); // 23:59 по Кишинёву — день ещё идёт
    expect((await apply(test, test.client, 'WINDOW')).statusCode).toBe(200);

    test.clock.set('2026-03-10T22:01:00Z'); // 00:01 следующего дня
    const late = await apply(test, test.client, 'WINDOW');
    expect(late.statusCode).toBe(400);
    expect(late.json().error.code).toBe('promo_expired');

    test.clock.set('2026-03-09T09:00:00Z');
    expect((await apply(test, test.client, 'WINDOW')).json().error.code).toBe('promo_not_started');
  });

  it('лимит использований: ожидающая оплаты покупка занимает место, отказ освобождает', async () => {
    const test = await makeBillingApp({ outcome: 'pending' });
    await createPromo(test, { code: 'ONLY1', kind: 'percent', value: 10, maxUses: 1 });
    const other = await addClient(test);

    const first = await buy(test, test.client, 12, { promoCode: 'ONLY1' });
    expect(first.body.purchase.status).toBe('pending');

    const blocked = await buy(test, other.cookie, 12, { promoCode: 'ONLY1' });
    expect(blocked.res.statusCode).toBe(400);
    expect(blocked.res.json().error.code).toBe('promo_limit');

    // первый платёж отклонён — место освободилось
    const paymentId = providerPaymentIdOf(test, first.body.purchase.id);
    test.stub.complete(paymentId, 'failed');
    await gatewayCallback(test, paymentId);
    test.stub.setOutcome('paid');
    const retry = await buy(test, other.cookie, 12, { promoCode: 'ONLY1' });
    expect(retry.body.purchase.status).toBe('paid');

    const list = (await call(test, 'GET', '/admin/promos', test.admin)).json().items as Array<{
      code: string;
      usedCount: number;
    }>;
    expect(list.find((p) => p.code === 'ONLY1')!.usedCount).toBe(1);
  });

  it('один раз на клиента: после оплаты повторное применение отклоняется, у другого клиента работает', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'ONCE', kind: 'percent', value: 10 });
    await buyPaid(test, test.client, 12, { promoCode: 'ONCE' });

    const again = await buy(test, test.client, 12, { promoCode: 'ONCE' });
    expect(again.res.json().error.code).toBe('promo_used');

    const other = await addClient(test);
    expect((await buy(test, other.cookie, 12, { promoCode: 'ONCE' })).body.purchase.status).toBe(
      'paid',
    );
  });

  it('без ограничения «один раз» код можно использовать повторно', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'MANY', kind: 'percent', value: 10, oncePerUser: false });
    await buyPaid(test, test.client, 12, { promoCode: 'MANY' });
    expect((await buy(test, test.client, 12, { promoCode: 'MANY' })).body.purchase.status).toBe(
      'paid',
    );
  });

  it('отключённый и неизвестный коды', async () => {
    const test = await makeBillingApp();
    const promo = await createPromo(test, { code: 'OFF', kind: 'percent', value: 10 });
    await call(test, 'PATCH', `/admin/promos/${promo.id}`, test.admin, { active: false });

    expect((await apply(test, test.client, 'OFF')).json().error.code).toBe('promo_inactive');
    const unknown = await apply(test, test.client, 'NOPE');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('promo_not_found');
  });

  it('ошибки приходят текстом на русском и румынском, а не ключом', async () => {
    const test = await makeBillingApp();
    await createPromo(test, { code: 'GONE', kind: 'percent', value: 10, validUntil: '2026-03-01' });

    const ru = (await apply(test, test.client, 'GONE', {}, 'ru')).json().error;
    const ro = (await apply(test, test.client, 'GONE', {}, 'ro')).json().error;

    expect(ru.message).toBe('Срок действия промокода закончился 2026-03-01.');
    expect(ro.message).toBe('Codul promoțional a expirat la 2026-03-01.');
    expect(ru.message).not.toBe(ro.message);
    const unknownRo = (await apply(test, test.client, 'XXX', {}, 'ro')).json().error.message;
    expect(unknownRo).toBe('Nu există un asemenea cod promoțional.');
  });

  it('перебор кодов: после 10 неудач клиент получает 429', async () => {
    const test = await makeBillingApp();
    for (let i = 0; i < 10; i += 1) await apply(test, test.client, `GUESS${i}`);
    const blocked = await apply(test, test.client, 'GUESS11');
    expect(blocked.statusCode).toBe(429);
    // другой клиент не затронут
    const other = await addClient(test);
    expect((await apply(test, other.cookie, 'GUESS11')).statusCode).toBe(404);
  });
});

describe('промокоды в админке', () => {
  it('создание, список с числом использований, правка, дубликат кода', async () => {
    const test = await makeBillingApp();
    const promo = await createPromo(test, {
      code: 'coach_ann',
      kind: 'free_credits',
      value: 1,
      ownerLabel: 'Тренер Анна',
      maxUses: 20,
    });
    expect(promo.code).toBe('COACH_ANN');

    const dup = await call(test, 'POST', '/admin/promos', test.admin, {
      code: 'Coach_Ann',
      kind: 'percent',
      value: 5,
    });
    expect(dup.statusCode).toBe(409);

    const patched = await call(test, 'PATCH', `/admin/promos/${promo.id}`, test.admin, {
      maxUses: 5,
      active: false,
    });
    expect(patched.json().promo).toMatchObject({
      maxUses: 5,
      active: false,
      ownerLabel: 'Тренер Анна',
    });
  });

  it('проверка значений: процент выше 100, неверные даты, формат кода', async () => {
    const test = await makeBillingApp();
    const post = (body: Record<string, unknown>) =>
      call(test, 'POST', '/admin/promos', test.admin, body);

    const percent = await post({ code: 'BIG', kind: 'percent', value: 150 });
    expect(percent.statusCode).toBe(400);
    expect(percent.json().error.fields.value).toBe('billing.error.promoValue');
    expect(
      (
        await post({
          code: 'DATES',
          kind: 'percent',
          value: 5,
          validFrom: '2026-05-02',
          validUntil: '2026-05-01',
        })
      ).statusCode,
    ).toBe(400);
    expect((await post({ code: 'a b', kind: 'percent', value: 5 })).json().error.fields.code).toBe(
      'billing.error.promoCodeFormat',
    );
    expect((await post({ code: 'FREE', kind: 'free_credits', value: 5000 })).statusCode).toBe(400);
  });
});
