import { describe, expect, it } from 'vitest';
import { PHONE } from '../auth/helpers.ts';
import { profileFor } from '../../src/modules/profile/index.ts';
import { call, makeBillingApp, newKey, packageId } from './helpers.ts';

describe('путь «вход → пакет → оплата» (R09)', () => {
  it('занимает не более 8 шагов после ввода кода и заканчивается кредитами на балансе', async () => {
    const test = await makeBillingApp({ outcome: 'pending' });
    let steps = 0;
    const step = async (
      ...args: Parameters<typeof call> extends [unknown, ...infer R] ? R : never
    ) => {
      steps += 1;
      return call(test, ...args);
    };

    // вход выполнен (код введён) — дальше считаем шаги клиента
    const list = await step('GET', '/packages', test.client); // 1. открыть «Пакеты»
    const pack = (list.json().items as Array<{ id: number; boxes: number }>).find(
      (p) => p.boxes === 20,
    )!;
    const bought = await step('POST', '/purchases', test.client, {
      // 2. выбрать пакет и нажать «Купить»
      packageId: pack.id,
      method: 'mia',
      idempotencyKey: newKey(),
    });
    const purchase = bought.json().purchase;
    expect(purchase.redirectUrl).toBe(`/pay/stub/${purchase.id}`); // 3. страница шлюза
    const paid = await step('POST', `/purchases/${purchase.id}/stub-pay`, test.client, {
      outcome: 'paid', // 4. «Оплатить»
    });
    expect(paid.json().purchase.status).toBe('paid');
    const status = await step('GET', `/purchases/${purchase.id}`, test.client); // 5. экран статуса
    expect(status.json().purchase.status).toBe('paid');
    const credits = await step('GET', '/credits', test.client); // 6. баланс на «Пакетах»

    expect(credits.json().balance).toBe(20);
    expect(steps).toBeLessThanOrEqual(8);
  });

  it('с промокодом путь остаётся в пределах 8 шагов', async () => {
    const test = await makeBillingApp();
    await call(test, 'POST', '/admin/promos', test.admin, {
      code: 'START10',
      kind: 'percent',
      value: 10,
    });
    let steps = 0;
    const step = async (
      ...args: Parameters<typeof call> extends [unknown, ...infer R] ? R : never
    ) => {
      steps += 1;
      return call(test, ...args);
    };

    await step('GET', '/packages', test.client);
    const preview = await step('POST', '/promo/apply', test.client, {
      code: 'START10',
      packageId: packageId(test, 12),
    });
    expect(preview.json().totalBani).toBe(12 * 10710);
    const bought = await step('POST', '/purchases', test.client, {
      packageId: packageId(test, 12),
      method: 'card',
      promoCode: 'START10',
      idempotencyKey: newKey(),
    });
    expect(bought.json().purchase.status).toBe('paid');
    await step('GET', '/credits', test.client);

    expect(steps).toBeLessThanOrEqual(8);
  });
});

describe('связь с другими модулями', () => {
  it('история покупок и журнал попадают в выгрузку данных клиента', async () => {
    const test = await makeBillingApp();
    await call(test, 'POST', '/purchases', test.client, {
      packageId: packageId(test, 12),
      method: 'card',
      idempotencyKey: newKey(),
    });

    const exported = await profileFor(test.app.deps).exportData(test.clientId);
    const billing = exported.data.billing as {
      purchases: Array<{ boxes: number; status: string }>;
      creditLedger: Array<{ delta: number; reason: string }>;
    };
    expect(billing.purchases).toEqual([expect.objectContaining({ boxes: 12, status: 'paid' })]);
    expect(billing.creditLedger).toEqual([
      expect.objectContaining({ delta: 12, reason: 'purchase' }),
    ]);
    expect(JSON.stringify(billing)).not.toContain(PHONE);
  });

  it('задачи billing зарегистрированы в планировщике', async () => {
    const test = await makeBillingApp();
    const jobs = test.app.deps.system.scheduler.list();
    expect(jobs).toEqual(
      expect.arrayContaining([
        { name: 'billing-expire', cron: '30 2 * * *' },
        { name: 'billing-pending', cron: '*/10 * * * *' },
      ]),
    );
  });
});
