import { describe, expect, it } from 'vitest';
import { shareOf } from '../../src/modules/reports/index.ts';
import { call, insertDelivered, makeReportsDay, report } from './helpers.ts';

describe('доля зала (R37.3)', () => {
  it('процент зала × выручка выданных боксов; невыданные и списанные боксы не входят', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'share')).json();

    // зал «Тест» 12,5 %: выдано 3×119 + 1×109 = 466 лей → 58,25 лей; невыданный бокс блюда C (119 лей) не входит
    // зал «Север» 10 %: выдано 2×99 = 198 лей → 19,80 лей
    expect(body.rows).toEqual([
      {
        gymId: day.gym2Id,
        gymName: 'Зал «Север»',
        sharePercent: 10,
        boxes: 2,
        revenueBani: 19800,
        shareBani: 1980,
      },
      {
        gymId: day.gymId,
        gymName: 'Зал «Тест»',
        sharePercent: 12.5,
        boxes: 4,
        revenueBani: 46600,
        shareBani: 5825,
      },
    ]);
    expect(body.totals).toEqual({ boxes: 6, revenueBani: 66400, shareBani: 7805 });
  });

  it('смена процента зала меняет долю, но не выручку', async () => {
    const day = await makeReportsDay();
    const patched = await call(day, 'PATCH', `/admin/gyms/${day.gymId}`, day.admin, {
      sharePercent: 20,
    });
    expect(patched.statusCode).toBe(200);
    const row = (await report(day, 'share'))
      .json()
      .rows.find((r: { gymId: string }) => r.gymId === day.gymId);
    expect(row).toMatchObject({ revenueBani: 46600, sharePercent: 20, shareBani: 9320 });
  });

  it('зал без выдач показан с нулём; за период без выдач доли нет', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'share', 'from=2026-03-12&to=2026-03-20')).json();
    expect(body.rows.map((r: { shareBani: number }) => r.shareBani)).toEqual([0, 0]);
    expect(body.totals).toEqual({ boxes: 0, revenueBani: 0, shareBani: 0 });
  });
});

describe('округление доли до бани', () => {
  it('половина бани округляется вверх, целочисленно, без ошибок дробных чисел', () => {
    expect(shareOf(12900, 12.5)).toBe(1613); // 1612,5
    expect(shareOf(1, 50)).toBe(1); // 0,5
    expect(shareOf(1, 49.99)).toBe(0);
    expect(shareOf(12900, 33.33)).toBe(4300); // 4299,57
    expect(shareOf(10000, 100)).toBe(10000);
    expect(shareOf(0, 12.5)).toBe(0);
    expect(shareOf(12345, 0)).toBe(0);
  });
});

describe('активные клиенты и отток', () => {
  it('активные, оставшиеся, новые и ушедшие клиенты; отток по залам', async () => {
    const day = await makeReportsDay();
    // предыдущий период (4–10 марта): first брал в зале «Тест», fourth тоже, fifth — в зале «Север»
    insertDelivered(day, { userId: day.clients.first, date: '2026-03-05' });
    insertDelivered(day, { userId: day.clients.fourth, date: '2026-03-05' });
    insertDelivered(day, {
      userId: day.clients.fifth,
      date: '2026-03-06',
      fridgeId: day.fridge2Id,
    });
    // тот же клиент дважды в периоде считается один раз
    insertDelivered(day, { userId: day.clients.first, date: '2026-03-07' });

    const body = (await report(day, 'retention', 'from=2026-03-11&to=2026-03-17')).json();
    expect(body.previous).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    // сейчас брали first, second, third; раньше first, fourth, fifth
    expect(body.totals).toEqual({
      active: 3,
      previousActive: 3,
      retained: 1,
      fresh: 2,
      churned: 2,
      churnPercent: 66.7,
    });
    expect(body.rows).toEqual([
      { gymId: day.gym2Id, gymName: 'Зал «Север»', active: 1, previousActive: 1, churned: 1 },
      { gymId: day.gymId, gymName: 'Зал «Тест»', active: 2, previousActive: 2, churned: 1 },
    ]);
  });

  it('невыданные и отменённые заказы клиента не делают его активным', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'retention', 'from=2026-03-11&to=2026-03-11')).json();
    // fourth не забрал, fifth отменил: активны только трое
    expect(body.totals.active).toBe(3);
  });

  it('без клиентов в предыдущем периоде доля оттока не считается', async () => {
    const day = await makeReportsDay();
    const body = (await report(day, 'retention', 'from=2026-03-11&to=2026-03-11')).json();
    expect(body.totals).toMatchObject({ previousActive: 0, churned: 0, churnPercent: null });
  });

  it('клиент, брал в обоих периодах в разных залах, остался в целом, но ушёл из зала', async () => {
    const day = await makeReportsDay();
    insertDelivered(day, {
      userId: day.clients.first,
      date: '2026-03-06',
      fridgeId: day.fridge2Id,
    });
    const body = (await report(day, 'retention', 'from=2026-03-11&to=2026-03-17')).json();
    expect(body.totals).toMatchObject({ previousActive: 1, retained: 1, churned: 0 });
    const north = body.rows.find((r: { gymId: string }) => r.gymId === day.gym2Id);
    expect(north).toMatchObject({ previousActive: 1, churned: 1 });
  });
});
