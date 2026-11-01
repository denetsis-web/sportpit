import { describe, expect, it } from 'vitest';
import {
  addFridge,
  call,
  clientWithCredits,
  makeKitchenApp,
  placeOk,
  summaryOf,
  TOMORROW,
} from './helpers.ts';

interface SummaryBody {
  date: string;
  closed: boolean;
  bufferPercent: number;
  fridges: Array<{ id: string; boxes: number; closed: boolean }>;
  dishes: Array<{
    dishId: number;
    planned: number;
    buffer: number;
    total: number;
    fridges: Array<{ fridgeId: string; qty: number }>;
  }>;
  totals: { planned: number; buffer: number; total: number };
}

describe('сводка кухни на дату (R32)', () => {
  it('равна сумме подтверждённых заказов: два холодильника, несколько блюд, отменённый заказ, расхождение 0', async () => {
    const test = await makeKitchenApp();
    const [a, b, c] = test.dishes;
    const f1 = test.fridgeId;
    const f2 = await addFridge(test);
    const client2 = await clientWithCredits(test, '+37360555101');
    const client3 = await clientWithCredits(test, '+37360555102');

    // клиент 1: заказ отменён, затем другой заказ — в сводку попадает только второй
    const cancelled = await placeOk(test, test.client, { items: [{ dishId: a, qty: 1 }] });
    expect(
      (await call(test, 'POST', `/orders/${cancelled.id}/cancel`, test.client)).statusCode,
    ).toBe(200);
    await placeOk(test, test.client, {
      items: [
        { dishId: a, qty: 2 },
        { dishId: b, qty: 1 },
      ],
    });
    // клиент 2: холодильник с несколькими блюдами
    await placeOk(test, client2, {
      items: [
        { dishId: a, qty: 1 },
        { dishId: c, qty: 2 },
      ],
    });
    // клиент 3: второй холодильник
    await placeOk(test, client3, { fridgeId: f2, items: [{ dishId: b, qty: 2 }] });

    const res = await summaryOf(test, TOMORROW);
    expect(res.statusCode).toBe(200);
    const summary = res.json() as SummaryBody;

    // ожидание разобрано вручную: A = 2 + 1, B = 1 + 2, C = 2; всего 8 порций
    const byDish = new Map(summary.dishes.map((d) => [d.dishId, d]));
    expect(byDish.get(a)).toMatchObject({ planned: 3, buffer: 0, total: 3 });
    expect(byDish.get(b)).toMatchObject({ planned: 3, buffer: 0, total: 3 });
    expect(byDish.get(c)).toMatchObject({ planned: 2, buffer: 0, total: 2 });
    const perFridge = (dishId: number) =>
      Object.fromEntries(byDish.get(dishId)!.fridges.map((f) => [f.fridgeId, f.qty]));
    expect(perFridge(a)).toEqual({ [f1]: 3 });
    expect(perFridge(b)).toEqual({ [f1]: 1, [f2]: 2 });
    expect(perFridge(c)).toEqual({ [f1]: 2 });
    expect(summary.totals).toEqual({ planned: 8, buffer: 0, total: 8 });
    expect(summary.dishes).toHaveLength(3);

    const boxes = Object.fromEntries(summary.fridges.map((f) => [f.id, f.boxes]));
    expect(boxes).toMatchObject({ [f1]: 6, [f2]: 2 });
    expect(summary.closed).toBe(false);
  });
});
