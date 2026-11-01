import { describe, expect, it } from 'vitest';
import { billingFor } from '../../src/modules/billing/index.ts';
import { call, makeReportsDay, report, PRICE, TOMORROW } from './helpers.ts';

describe('отчёт «Продажи» (R37, R106)', () => {
  it('выручка — по выданным боксам, цена кредита лота; по залам и пакетам; невыданные, списанные и отменённые не входят', async () => {
    const day = await makeReportsDay();
    const res = await report(day, 'sales');
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // разобрано вручную: first 3 бокса по 119, second 1 по 109 (зал «Тест»), third 2 по 99 (зал «Север»)
    expect(body.rows).toEqual([
      {
        gymId: day.gym2Id,
        gymName: 'Зал «Север»',
        packageBoxes: 30,
        boxes: 2,
        revenueBani: 2 * PRICE[30],
      },
      {
        gymId: day.gymId,
        gymName: 'Зал «Тест»',
        packageBoxes: 12,
        boxes: 3,
        revenueBani: 3 * PRICE[12],
      },
      {
        gymId: day.gymId,
        gymName: 'Зал «Тест»',
        packageBoxes: 20,
        boxes: 1,
        revenueBani: PRICE[20],
      },
    ]);
    expect(body.totals).toEqual({
      orders: 3,
      boxes: 6,
      revenueBani: 3 * PRICE[12] + PRICE[20] + 2 * PRICE[30],
    });
    expect(body.range).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(body.page).toEqual({ number: 1, size: 50, total: 3, pages: 1 });
  });

  it('график по дням: каждый день периода есть, выручка стоит на дне выдачи', async () => {
    const day = await makeReportsDay();
    const { daily } = (await report(day, 'sales')).json();
    expect(daily).toHaveLength(31);
    expect(daily[0]).toEqual({ date: '2026-03-01', boxes: 0, revenueBani: 0 });
    expect(daily.filter((d: { boxes: number }) => d.boxes > 0)).toEqual([
      { date: TOMORROW, boxes: 6, revenueBani: 66400 },
    ]);
  });

  it('проданные пакеты за период: сколько оплачено и на какую сумму', async () => {
    const day = await makeReportsDay();
    const { purchases } = (await report(day, 'sales')).json();
    // три пакета по 12 (first, fourth, fifth), один на 20 и один на 30
    expect(purchases).toEqual([
      { packageBoxes: 12, count: 3, totalBani: 3 * 12 * PRICE[12] },
      { packageBoxes: 20, count: 1, totalBani: 20 * PRICE[20] },
      { packageBoxes: 30, count: 1, totalBani: 30 * PRICE[30] },
    ]);
  });

  it('период вне дня выдачи пуст: ни строк, ни выручки, ни проданных пакетов', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'sales', 'from=2026-03-12&to=2026-03-20')).json();
    expect(body.rows).toEqual([]);
    expect(body.totals).toEqual({ orders: 0, boxes: 0, revenueBani: 0 });
    expect(body.purchases).toEqual([]);
    expect(body.page).toMatchObject({ total: 0, pages: 1 });
  });

  it('выручка заказа равна сумме «кредиты × цена лота» из billing.orderCredits', async () => {
    const day = await makeReportsDay();
    const billing = billingFor(day.deps);
    const expected = Object.values(day.orders)
      .filter((o) => o.id !== day.orders.fourth.id)
      .map((o) => billing.orderCredits(o.id))
      .flatMap((state) => state.lots)
      .reduce((sum, lot) => sum + lot.credits * lot.unitPriceBani, 0);
    const { totals } = (await report(day, 'sales')).json();
    expect(totals.revenueBani).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('цена берётся из лота на момент покупки: правка цены пакета отчёт не меняет', async () => {
    const day = await makeReportsDay();
    await call(day, 'PATCH', '/admin/packages/1', day.admin, { pricePerBoxBani: 50000 });
    const { totals } = (await report(day, 'sales')).json();
    expect(totals.revenueBani).toBe(3 * PRICE[12] + PRICE[20] + 2 * PRICE[30]);
  });

  it('без периода — последние 30 дней по сегодняшней дате Кишинёва', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'sales', '')).json();
    expect(body.range).toEqual({ from: '2026-02-10', to: '2026-03-11' });
    expect(body.totals.boxes).toBe(6);
  });

  it('неверный период отклоняется: перепутаны даты, дата не календарная, больше года', async () => {
    const day = await makeReportsDay();
    const swapped = await report(day, 'sales', 'from=2026-03-20&to=2026-03-01');
    expect(swapped.statusCode).toBe(400);
    expect(swapped.json().error.code).toBe('bad_range');
    const longer = await report(day, 'sales', 'from=2024-01-01&to=2026-03-01');
    expect(longer.statusCode).toBe(400);
    const notDate = await report(day, 'sales', 'from=2026-02-30&to=2026-03-01');
    expect(notDate.statusCode).toBe(400);
    expect(notDate.json().error.fields.from).toBe('reports.error.date');
    const page = await report(day, 'sales', 'from=2026-03-01&to=2026-03-31&page=0');
    expect(page.statusCode).toBe(400);
  });

  it('доступ только у администратора: гость 401, клиент и кухня 403', async () => {
    const day = await makeReportsDay();
    const guest = await day.app.inject({ method: 'GET', url: '/api/v1/admin/reports/sales' });
    expect(guest.statusCode).toBe(401);
    expect((await report(day, 'sales', '', day.client)).statusCode).toBe(403);
    expect((await report(day, 'sales', '', day.kitchen)).statusCode).toBe(403);
    expect((await report(day, 'sales', '', day.operator)).statusCode).toBe(403);
    expect((await report(day, 'unknown')).statusCode).toBe(404);
  });
});
