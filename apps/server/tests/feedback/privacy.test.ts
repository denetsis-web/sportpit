import { describe, expect, it } from 'vitest';
import { feedbackFor } from '../../src/modules/feedback/index.ts';
import { profileFor } from '../../src/modules/profile/index.ts';
import { addClient, buyPaid } from '../billing/helpers.ts';
import {
  call,
  complain,
  jpegFile,
  makeOrdersApp,
  pickedUpOrder,
  rate,
  type OrdersTest,
} from './helpers.ts';

async function clientWithComplaint(test: OrdersTest, cookie: string, date: string) {
  const order = await pickedUpOrder(test, cookie, { date });
  await rate(test, cookie, { orderId: order.id, dishId: test.dishes[0], stars: 4, tag: 'taste' });
  const res = await complain(test, cookie, {
    orderId: order.id,
    reason: 'spoiled',
    description: 'Личное описание проблемы',
    file: jpegFile(),
  });
  const complaint = res.json().complaint as { id: string };
  const key = test.deps.db.get<{ storage_key: string }>(
    'SELECT storage_key FROM complaint_photos WHERE complaint_id = ?',
    [complaint.id],
  )!.storage_key;
  return { order, complaint, key };
}

describe('выгрузка данных клиента (R29.1): провайдер feedback', () => {
  it('отдаёт оценки и жалобы только текущего клиента, без чужих и без байтов фото', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    await buyPaid(test, stranger.cookie, 12);
    const mine = await clientWithComplaint(test, test.client, '2026-03-11');
    const theirs = await clientWithComplaint(test, stranger.cookie, '2026-03-12');

    const res = await call(test, 'GET', '/profile/export', test.client);
    expect(res.statusCode).toBe(200);
    const feedback = res.json().data.feedback;
    expect(feedback.ratings).toEqual([
      expect.objectContaining({
        orderId: mine.order.id,
        dishId: test.dishes[0],
        stars: 4,
        tag: 'taste',
      }),
    ]);
    expect(feedback.complaints).toHaveLength(1);
    expect(feedback.complaints[0]).toMatchObject({
      id: mine.complaint.id,
      reason: 'spoiled',
      description: 'Личное описание проблемы',
      status: 'open',
    });
    expect(feedback.complaints[0].photos[0]).toEqual({
      id: expect.any(Number),
      contentType: 'image/jpeg',
    });
    expect(res.body).not.toContain(theirs.complaint.id);
    expect(res.body).not.toContain(theirs.order.id);
    expect(res.body).not.toContain('complaints/');
  });
});

describe('удаление аккаунта (R29): хук feedback', () => {
  it('стирает текст жалоб и фото клиента (записи и файлы), чужие жалобы и фото не трогает', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    await buyPaid(test, stranger.cookie, 12);
    const mine = await clientWithComplaint(test, test.client, '2026-03-11');
    const theirs = await clientWithComplaint(test, stranger.cookie, '2026-03-12');
    expect(await test.deps.storage.get(mine.key)).toBeDefined();

    const res = await call(test, 'POST', '/profile/account/delete', test.client, { confirm: true });
    expect(res.statusCode).toBe(200);

    const row = test.deps.db.get<{ description: string }>(
      'SELECT description FROM complaints WHERE id = ?',
      [mine.complaint.id],
    )!;
    expect(row.description).toBe('');
    expect(
      test.deps.db.query('SELECT id FROM complaint_photos WHERE complaint_id = ?', [
        mine.complaint.id,
      ]),
    ).toEqual([]);

    // файлы из хранилища уходят сразу после фиксации транзакции; явный проход доводит очередь до конца
    await feedbackFor(test.deps).sweepTrash();
    expect(await test.deps.storage.get(mine.key)).toBeUndefined();
    expect(test.deps.db.query('SELECT storage_key FROM feedback_file_trash')).toEqual([]);

    expect(await test.deps.storage.get(theirs.key)).toBeDefined();
    expect(
      test.deps.db.get<{ description: string }>('SELECT description FROM complaints WHERE id = ?', [
        theirs.complaint.id,
      ])!.description,
    ).toBe('Личное описание проблемы');
    expect(
      test.deps.db.query('SELECT id FROM complaint_photos WHERE complaint_id = ?', [
        theirs.complaint.id,
      ]),
    ).toHaveLength(1);
  });

  it('хук синхронный: ключи файлов ставятся в очередь внутри транзакции и откатываются вместе с ней', async () => {
    const test = await makeOrdersApp();
    const mine = await clientWithComplaint(test, test.client, '2026-03-11');
    const feedback = feedbackFor(test.deps);
    // стирание в транзакции, которая откатывается: ни записей о фото, ни очереди, ни стёртого текста
    expect(() =>
      test.deps.db.tx((tx) => {
        const result = feedback.eraseUser(test.clientId, tx);
        expect(result).toBeUndefined();
        throw new Error('откат');
      }),
    ).toThrow('откат');
    expect(test.deps.db.query('SELECT storage_key FROM feedback_file_trash')).toEqual([]);
    expect(
      test.deps.db.query('SELECT id FROM complaint_photos WHERE complaint_id = ?', [
        mine.complaint.id,
      ]),
    ).toHaveLength(1);
    expect(await test.deps.storage.get(mine.key)).toBeDefined();
  });

  it('повтор имени провайдера или хука отвергается профилем: feedback зарегистрирован один раз', () => {
    return makeOrdersApp().then((test) => {
      const profile = profileFor(test.deps);
      expect(() => profile.registerExportProvider('feedback', () => ({}))).toThrow();
      expect(() => profile.registerDeletionHook('feedback', () => undefined)).toThrow();
    });
  });
});
