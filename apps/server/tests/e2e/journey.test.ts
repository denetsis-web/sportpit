import { describe, expect, it } from 'vitest';
import { feedbackFor } from '../../src/modules/feedback/index.ts';
import { call, TOMORROW } from '../fulfillment/helpers.ts';
import { summary } from '../kitchen/helpers.ts';
import { report, reportCsv } from '../reports/helpers.ts';
import { COMPLAINT_TEXT, E2E_PHONE, runJourney, TRACKER_NAME } from './journey.ts';
import { SAMPLE } from '../profile/helpers.ts';

const PHONE_DIGITS = E2E_PHONE.slice(4); // «69777001» без кода страны

/** Все таблицы базы одной строкой: чтобы искать следы данных по всей базе, а не по списку известных таблиц. */
function dumpDatabase(journey: Awaited<ReturnType<typeof runJourney>>): string {
  const db = journey.test.deps.db;
  const tables = db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return tables
    .map(({ name }) => `${name}: ${JSON.stringify(db.query(`SELECT * FROM ${name}`))}`)
    .join('\n');
}

const count = (
  j: Awaited<ReturnType<typeof runJourney>>,
  sql: string,
  ...params: Array<string | number>
) => j.test.deps.db.get<{ n: number }>(sql, params)!.n;

describe('сквозной путь клиента: от входа до отчёта (R02, R09, R37, R60)', () => {
  it('вход → анкета → пакет → оплата → заказ → кухня → загрузка → выдача → оценка → отчёт', async () => {
    const j = await runJourney();
    const { test } = j;

    // вход и анкета
    expect(j.steps.phoneShownAfterLogin).toBe(E2E_PHONE);
    expect(j.steps.targets).toMatchObject({ kcal: 2345, proteinG: 160 });
    // пакет: платёж ждал колбэка, потом кредиты зачислились ровно один раз
    expect(j.steps.paymentStatusBeforeCallback).toBe('pending');
    expect(j.steps.balanceAfterPayment).toBe(12);
    // заказ выдан клиентом, три кредита потрачены
    expect(j.steps.orderStatusAfterPickup).toBe('picked_up');
    expect((await call(test, 'GET', '/credits', j.cookie)).json().balance).toBe(9);
    // выдача создала уведомление «Как блюдо?»
    const bell = (await call(test, 'GET', '/notifications', j.cookie)).json();
    expect(bell.items.map((n: { type: string }) => n.type)).toContain('rate_dish');

    // сводка кухни равна подтверждённым заказам: A 3 (2+1), B 1; отменённый заказ не вошёл
    const [a, b] = test.dishes;
    const planned = (await summary(test, TOMORROW)).dishes.map((d) => [d.dishId, d.planned]);
    expect(planned).toEqual([
      [a, 3],
      [b, 1],
    ]);

    // отчёт за период: цифры разобраны вручную
    // выручка: 3 выданных бокса × 119 лей = 357 лей; невыданный бокс второго клиента не входит
    const sales = (await report(test, 'sales')).json();
    expect(sales.totals).toEqual({ orders: 1, boxes: 3, revenueBani: 35700 });
    expect(sales.rows).toEqual([
      { gymId: test.gymId, gymName: 'Зал «Тест»', packageBoxes: 12, boxes: 3, revenueBani: 35700 },
    ]);
    // приготовлено 4, выдано 3, списано 1 → 25 %
    const waste = (await report(test, 'waste')).json();
    expect(waste.totals).toEqual({ cooked: 4, delivered: 3, writtenOff: 1, wastePercent: 25 });
    // доля зала 12,5 % × 357 лей = 44,625 → 44,63 лей
    const share = (await report(test, 'share')).json();
    expect(share.rows[0]).toMatchObject({
      sharePercent: 12.5,
      revenueBani: 35700,
      shareBani: 4463,
    });
    const ratings = (await report(test, 'ratings')).json();
    expect(ratings.rows).toEqual([
      expect.objectContaining({ dishId: a, count: 1, avg: 5, allTimeAvg: 5, allTimeCount: 1 }),
    ]);
    expect((await report(test, 'retention')).json().totals).toMatchObject({
      active: 1,
      previousActive: 0,
      churned: 0,
    });
    // выгрузка в Excel открывается с BOM и теми же цифрами
    const csv = (await reportCsv(test, 'sales')).body;
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Зал «Тест»;12;3;357,00');
  });

  it('выгрузка данных клиента содержит профиль, согласия, заказы, оценки и ручные записи трекера', async () => {
    const j = await runJourney();
    const res = await call(j.test, 'GET', '/profile/export', j.cookie);
    expect(res.statusCode).toBe(200);
    const exported = res.json();

    expect(exported.user).toMatchObject({ id: j.userId, phone: E2E_PHONE });
    expect(exported.profile).toMatchObject(SAMPLE);
    expect(exported.consents.find((c: { kind: string }) => c.kind === 'health_data')).toMatchObject(
      {
        granted: true,
      },
    );
    expect(exported.data.orders.items).toEqual([
      expect.objectContaining({ id: j.orderId, status: 'picked_up', boxes: 3 }),
    ]);
    expect(exported.data.feedback.ratings).toEqual([
      expect.objectContaining({ orderId: j.orderId, stars: 5, tag: 'taste' }),
    ]);
    expect(exported.data.feedback.complaints).toEqual([
      expect.objectContaining({ id: j.complaintId, description: COMPLAINT_TEXT }),
    ]);
    expect(exported.data.tracker.entries).toEqual([
      expect.objectContaining({ name: TRACKER_NAME, calories: 150 }),
    ]);
    expect(exported.data.billing.purchases).toEqual([
      expect.objectContaining({ boxes: 12, status: 'paid' }),
    ]);
    expect(exported.data.notifications.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'rate_dish' })]),
    );
    // чужого в выгрузке нет
    expect(res.body).not.toContain(j.secondOrderId);
    expect(res.body).not.toContain('+37369777002');
  });
});

describe('удаление аккаунта: персональных данных не остаётся (R29, R56)', () => {
  async function deleted() {
    const j = await runJourney();
    const res = await call(j.test, 'POST', '/profile/account/delete', j.cookie, { confirm: true });
    expect(res.statusCode).toBe(200);
    await feedbackFor(j.test.deps).sweepTrash();
    return j;
  }

  it('телефон, анкета, сессии и коды входа стёрты; номера нет ни в одной таблице', async () => {
    const j = await deleted();
    expect(
      j.test.deps.db.get('SELECT phone, deleted_at FROM users WHERE id = ?', [j.userId]),
    ).toMatchObject({ phone: null });
    expect(count(j, 'SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?', j.userId)).toBe(0);
    expect(count(j, 'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', j.userId)).toBe(0);
    expect(count(j, 'SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ?', E2E_PHONE)).toBe(0);
    const dump = dumpDatabase(j);
    expect(dump).not.toContain(PHONE_DIGITS);
    // сам вход старой cookie закрыт
    expect((await call(j.test, 'GET', '/profile', j.cookie)).statusCode).toBe(401);
  });

  it('ручные записи трекера, текст жалобы и фото жалобы стёрты (записи и файл)', async () => {
    const j = await runJourney();
    const photo = j.test.deps.db.get<{ storage_key: string }>(
      'SELECT storage_key FROM complaint_photos WHERE complaint_id = ?',
      [j.complaintId],
    );
    // фото было: без этого проверка «файла нет» ничего бы не доказывала
    expect(photo?.storage_key).toMatch(/^complaints\//);
    expect(await j.test.deps.storage.get(photo!.storage_key)).toBeDefined();
    const res = await call(j.test, 'POST', '/profile/account/delete', j.cookie, { confirm: true });
    expect(res.statusCode).toBe(200);
    await feedbackFor(j.test.deps).sweepTrash();
    expect(count(j, 'SELECT COUNT(*) AS n FROM tracker_entries WHERE user_id = ?', j.userId)).toBe(
      0,
    );
    expect(
      j.test.deps.db.get<{ description: string }>(
        'SELECT description FROM complaints WHERE id = ?',
        [j.complaintId],
      )!.description,
    ).toBe('');
    expect(
      count(j, 'SELECT COUNT(*) AS n FROM complaint_photos WHERE complaint_id = ?', j.complaintId),
    ).toBe(0);
    expect(count(j, 'SELECT COUNT(*) AS n FROM feedback_file_trash')).toBe(0);
    expect(dumpDatabase(j)).not.toContain(COMPLAINT_TEXT);
    expect(dumpDatabase(j)).not.toContain(TRACKER_NAME);
    expect(await j.test.deps.storage.get(photo!.storage_key)).toBeUndefined();
  });

  it('уведомления клиента стёрты вместе с аккаунтом: до удаления строки есть, после — ноль', async () => {
    const j = await runJourney();
    const before = count(j, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', j.userId);
    expect(before).toBeGreaterThan(0); // выдача создала «Как блюдо?»
    const secondBefore = count(
      j,
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?',
      j.secondUserId,
    );
    const res = await call(j.test, 'POST', '/profile/account/delete', j.cookie, { confirm: true });
    expect(res.statusCode).toBe(200);
    expect(count(j, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', j.userId)).toBe(0);
    // уведомления второго клиента не тронуты
    expect(
      count(j, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', j.secondUserId),
    ).toBe(secondBefore);
  });

  it('чужие данные остаются: заказ и анкета второго клиента на месте', async () => {
    const j = await deleted();
    expect(
      count(
        j,
        "SELECT COUNT(*) AS n FROM orders WHERE id = ? AND status = 'written_off'",
        j.secondOrderId,
      ),
    ).toBe(1);
    expect(
      j.test.deps.db.get<{ phone: string }>('SELECT phone FROM users WHERE id = ?', [
        j.secondUserId,
      ])!.phone,
    ).toBe('+37369777002');
  });
});
