import { describe, expect, it } from 'vitest';
import { setAuditSink } from '../../src/modules/billing/index.ts';
import { buy, buyPaid, call, lotsOf, makeBillingApp, newKey, packageId } from './helpers.ts';

describe('пакеты из базы', () => {
  it('стартовые пакеты 12 / 20 / 30 и разовый бокс по 119 / 109 / 99 / 129 лей за бокс', async () => {
    const test = await makeBillingApp();
    const res = await call(test, 'GET', '/packages');

    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      boxes: number;
      pricePerBoxBani: number;
      totalBani: number;
      validityDays: number;
    }>;
    expect(items.map((p) => [p.boxes, p.pricePerBoxBani])).toEqual([
      [12, 11900],
      [20, 10900],
      [30, 9900],
      [1, 12900],
    ]);
    expect(items.map((p) => p.totalBani)).toEqual([142800, 218000, 297000, 12900]);
    expect(items.every((p) => p.validityDays === 45)).toBe(true);
  });

  it('администратор меняет цену и состав без релиза; клиент видит сразу, купленное сохраняет цену', async () => {
    const test = await makeBillingApp();
    await buyPaid(test, test.client, 12); // куплено по 119
    const twelve = packageId(test, 12);

    const changed = await call(test, 'PATCH', `/admin/packages/${twelve}`, test.admin, {
      pricePerBoxBani: 12500,
      boxes: 14,
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().package).toMatchObject({ boxes: 14, pricePerBoxBani: 12500 });

    const seen = (await call(test, 'GET', '/packages')).json().items as Array<{
      id: number;
      boxes: number;
      pricePerBoxBani: number;
    }>;
    expect(seen.find((p) => p.id === twelve)).toMatchObject({ boxes: 14, pricePerBoxBani: 12500 });

    // старая покупка и её лот не изменились
    const purchase = test.app.deps.db.get<{
      boxes: number;
      unit_price_bani: number;
      total_bani: number;
    }>('SELECT boxes, unit_price_bani, total_bani FROM purchases');
    expect(purchase).toEqual({ boxes: 12, unit_price_bani: 11900, total_bani: 142800 });
    expect(lotsOf(test, test.clientId)[0]).toMatchObject({ credits: 12, unit_price_bani: 11900 });

    // новая покупка идёт по новой цене
    const fresh = await buy(test, test.client, 14);
    expect(fresh.body.purchase).toMatchObject({
      boxes: 14,
      unitPriceBani: 12500,
      totalBani: 14 * 12500,
    });
  });

  it('отключённый пакет скрыт у клиента и не покупается, но виден администратору', async () => {
    const test = await makeBillingApp();
    const thirty = packageId(test, 30);
    await call(test, 'PATCH', `/admin/packages/${thirty}`, test.admin, { active: false });

    const client = (await call(test, 'GET', '/packages')).json().items as Array<{ boxes: number }>;
    const admin = (await call(test, 'GET', '/admin/packages', test.admin)).json().items as Array<{
      boxes: number;
    }>;
    expect(client.map((p) => p.boxes)).not.toContain(30);
    expect(admin.map((p) => p.boxes)).toContain(30);

    const res = await call(test, 'POST', '/purchases', test.client, {
      packageId: thirty,
      method: 'card',
      idempotencyKey: newKey(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('package_unavailable');
  });

  it('администратор добавляет новый пакет', async () => {
    const test = await makeBillingApp();
    const res = await call(test, 'POST', '/admin/packages', test.admin, {
      boxes: 8,
      pricePerBoxBani: 12000,
    });
    expect(res.statusCode).toBe(201);
    const items = (await call(test, 'GET', '/packages')).json().items as Array<{ boxes: number }>;
    expect(items.map((p) => p.boxes)).toContain(8);
  });

  it('правка пакета: проверка значений и доступ только администратору', async () => {
    const test = await makeBillingApp();
    const twelve = packageId(test, 12);
    const bad = await call(test, 'PATCH', `/admin/packages/${twelve}`, test.admin, {
      pricePerBoxBani: 0,
    });
    expect(bad.statusCode).toBe(400);
    const empty = await call(test, 'PATCH', `/admin/packages/${twelve}`, test.admin, {});
    expect(empty.statusCode).toBe(400);
    const missing = await call(test, 'PATCH', '/admin/packages/9999', test.admin, {
      active: false,
    });
    expect(missing.statusCode).toBe(404);

    const forbidden = await call(test, 'PATCH', `/admin/packages/${twelve}`, test.client, {
      active: false,
    });
    expect(forbidden.statusCode).toBe(403);
    const anonymous = await call(test, 'GET', '/admin/packages');
    expect(anonymous.statusCode).toBe(401);
    expect((await call(test, 'GET', '/admin/promos', test.client)).statusCode).toBe(403);
    expect((await call(test, 'GET', '/admin/refunds', test.client)).statusCode).toBe(403);
    expect((await call(test, 'GET', '/admin/purchases', test.client)).statusCode).toBe(403);
  });
});

describe('журнал действий администратора (шов AuditSink)', () => {
  it('изменения пакетов, промокодов и возвраты уходят в приёмник с идентификатором администратора', async () => {
    const test = await makeBillingApp();
    const seen: Array<[number | null, string, string]> = [];
    setAuditSink(test.app.deps, (userId, action, target) => {
      seen.push([userId, action, target]);
    });
    const twelve = packageId(test, 12);

    await call(test, 'PATCH', `/admin/packages/${twelve}`, test.admin, { pricePerBoxBani: 12000 });
    await call(test, 'POST', '/admin/promos', test.admin, {
      code: 'AUD1',
      kind: 'percent',
      value: 10,
    });
    const purchase = await buyPaid(test, test.client, 12);
    await call(test, 'POST', '/admin/refunds', test.admin, {
      purchaseId: purchase.id,
      reason: 'ошибка заказа',
    });

    expect(seen).toEqual([
      [test.adminId, 'package.update', `package:${twelve}`],
      [test.adminId, 'promo.create', expect.stringMatching(/^promo:\d+$/)],
      [test.adminId, 'refund.create', `purchase:${purchase.id}`],
    ]);
  });

  it('по умолчанию действия попадают в admin.audit, если модуль подключён', async (ctx) => {
    const test = await makeBillingApp();
    const hasTable = test.app.deps.db.get(
      "SELECT 1 AS x FROM sqlite_master WHERE name = 'admin_audit'",
    );
    if (!hasTable) ctx.skip(); // модуль admin ещё не подключён: шов остаётся пустым
    await call(test, 'POST', '/admin/packages', test.admin, { boxes: 5, pricePerBoxBani: 12000 });
    const rows = test.app.deps.db.query<{ action: string; user_id: number }>(
      "SELECT action, user_id FROM admin_audit WHERE action = 'package.create'",
    );
    expect(rows).toEqual([{ action: 'package.create', user_id: test.adminId }]);
  });
});
