import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import { ordersFor } from '../../src/modules/orders/index.ts';
import { addClient } from '../billing/helpers.ts';
import {
  call,
  complain,
  jpegFile,
  makeOrdersApp,
  pickedUpOrder,
  placeOk,
  pngFile,
  type OrdersTest,
} from './helpers.ts';

const photoCall = (test: OrdersTest, url: string, cookie?: string) =>
  test.app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });

describe('жалоба «Проблема с боксом» (R30)', () => {
  it('принимает причину из списка, описание и фото JPEG; фото лежит в хранилище под приватным префиксом', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const res = await complain(test, test.client, {
      orderId: order.id,
      dishId: test.dishes[0],
      reason: 'spoiled',
      description: 'Запах не свежий',
      file: jpegFile(),
    });
    expect(res.statusCode).toBe(201);
    const { complaint } = res.json();
    expect(complaint).toMatchObject({
      orderId: order.id,
      dishId: test.dishes[0],
      reason: 'spoiled',
      description: 'Запах не свежий',
      status: 'open',
      outcome: null,
    });
    expect(complaint.history.map((e: { kind: string }) => e.kind)).toEqual(['created']);
    expect(complaint.photos).toHaveLength(1);
    expect(complaint.photos[0].url).toBe(
      `/api/v1/feedback/complaints/${complaint.id}/photos/${complaint.photos[0].id}`,
    );
    const stored = test.deps.db.get<{ storage_key: string; content_type: string }>(
      'SELECT storage_key, content_type FROM complaint_photos WHERE complaint_id = ?',
      [complaint.id],
    )!;
    expect(stored.storage_key).toMatch(/^complaints\/[a-z0-9-]+\.jpg$/);
    expect(stored.content_type).toBe('image/jpeg');
    expect(await test.deps.storage.get(stored.storage_key)).toBeDefined();
  });

  it('фото необязательно; PNG принимается', async () => {
    const test = await makeOrdersApp();
    const first = await pickedUpOrder(test);
    const second = await pickedUpOrder(test, test.client, { date: '2026-03-12' });
    const noPhoto = await complain(test, test.client, { orderId: first.id, reason: 'other' });
    expect(noPhoto.statusCode).toBe(201);
    expect(noPhoto.json().complaint.photos).toEqual([]);
    const png = await complain(test, test.client, {
      orderId: second.id,
      reason: 'damaged',
      file: pngFile(),
    });
    expect(png.statusCode).toBe(201);
    expect(png.json().complaint.photos[0].contentType).toBe('image/png');
  });

  it('отвергает не JPEG/PNG (даже с заявленным image/jpeg), файл больше 5 МБ и причину не из списка', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const gif = await complain(test, test.client, {
      orderId: order.id,
      reason: 'spoiled',
      file: {
        bytes: Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1'),
        filename: 'x.jpg',
        contentType: 'image/jpeg',
      },
    });
    expect(gif.statusCode).toBe(400);
    expect(gif.json().error.fields.photo).toBe('feedback.error.photoType');

    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]);
    const huge = await complain(test, test.client, {
      orderId: order.id,
      reason: 'spoiled',
      file: { bytes: big, filename: 'big.jpg', contentType: 'image/jpeg' },
    });
    expect(huge.statusCode).toBe(413);
    expect(huge.json().error.code).toBe('photo_too_large');

    const badReason = await complain(test, test.client, { orderId: order.id, reason: 'angry' });
    expect(badReason.statusCode).toBe(400);
    expect(badReason.json().error.fields.reason).toBeDefined();
    const noReason = await complain(test, test.client, { orderId: order.id });
    expect(noReason.statusCode).toBe(400);
    expect(test.deps.db.query('SELECT id FROM complaints')).toEqual([]);
    expect(test.deps.db.query('SELECT id FROM complaint_photos')).toEqual([]);
  });

  it('жаловаться можно на свой загруженный, выданный или списанный бокс; чужой — 404, неготовый — 409', async () => {
    const test = await makeOrdersApp();
    const stranger = await addClient(test);
    const confirmed = await placeOk(test);
    const early = await complain(test, test.client, { orderId: confirmed.id, reason: 'missing' });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('order_not_eligible');

    const picked = await pickedUpOrder(test, test.client, { date: '2026-03-12' });
    const foreign = await complain(test, stranger.cookie, { orderId: picked.id, reason: 'other' });
    expect(foreign.statusCode).toBe(404);
    const unknown = await complain(test, test.client, { orderId: 'nope', reason: 'other' });
    expect(unknown.statusCode).toBe(404);
    const wrongDish = await complain(test, test.client, {
      orderId: picked.id,
      dishId: test.dishes[2],
      reason: 'other',
    });
    expect(wrongDish.statusCode).toBe(404);

    // бокс не выдан по вине сервиса: заказ списан, жаловаться можно (R40: возврат только решением по жалобе)
    ordersFor(test.deps).transition(confirmed.id, 'written_off', { kind: 'system' });
    const writtenOff = await complain(test, test.client, {
      orderId: confirmed.id,
      reason: 'missing',
    });
    expect(writtenOff.statusCode).toBe(201);
  });

  it('на один заказ — одна жалоба, пока она открыта; без входа — 401', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    expect(
      (await complain(test, test.client, { orderId: order.id, reason: 'other' })).statusCode,
    ).toBe(201);
    const again = await complain(test, test.client, { orderId: order.id, reason: 'spoiled' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('complaint_exists');
    const anon = await call(test, 'POST', '/feedback/complaints', undefined, {});
    expect(anon.statusCode).toBe(401);
  });
});

describe('фото жалобы отдаёт только модуль обратной связи (R30, правило 13)', () => {
  async function withPhoto() {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const res = await complain(test, test.client, {
      orderId: order.id,
      reason: 'spoiled',
      file: jpegFile(),
    });
    const complaint = res.json().complaint;
    const key = test.deps.db.get<{ storage_key: string }>(
      'SELECT storage_key FROM complaint_photos WHERE complaint_id = ?',
      [complaint.id],
    )!.storage_key;
    return { test, complaint, key, url: complaint.photos[0].url as string };
  }

  it('владелец и администратор получают файл с верным типом, другой клиент — 404, без входа — 401', async () => {
    const { test, url } = await withPhoto();
    const owner = await photoCall(test, url, test.client);
    expect(owner.statusCode).toBe(200);
    expect(owner.headers['content-type']).toBe('image/jpeg');
    expect(owner.headers['cache-control']).toContain('private');
    expect(owner.headers['x-content-type-options']).toBe('nosniff');
    expect(owner.rawPayload.length).toBeGreaterThan(0);
    expect((await photoCall(test, url, test.admin)).statusCode).toBe(200);

    const stranger = await addClient(test);
    expect((await photoCall(test, url, stranger.cookie)).statusCode).toBe(404);
    expect((await photoCall(test, url)).statusCode).toBe(401);
    const missing = await photoCall(test, url.replace(/\/\d+$/, '/999'), test.client);
    expect(missing.statusCode).toBe(404);
  });

  it('публичный путь файлов ключ жалобы не отдаёт, хотя файл в хранилище есть', async () => {
    const { test, key } = await withPhoto();
    expect(await test.deps.storage.get(key)).toBeDefined();
    const res = await test.app.inject({ method: 'GET', url: `/api/v1/files/${key}` });
    expect(res.statusCode).toBe(404);
    const withCookie = await test.app.inject({
      method: 'GET',
      url: `/api/v1/files/${key}`,
      headers: { cookie: test.client },
    });
    expect(withCookie.statusCode).toBe(404);
  });
});

describe('раздел «Поддержка» (R30.1)', () => {
  it('отдаёт контакты из настроек и статусы обращений клиента; чужих обращений нет', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const stranger = await addClient(test);
    const created = (
      await complain(test, test.client, {
        orderId: order.id,
        reason: 'other',
        description: 'Привет',
      })
    ).json().complaint;

    const before = (await call(test, 'GET', '/feedback/support', test.client)).json();
    expect(before.contacts).toEqual(adminFor(test.deps).getSetting('supportContacts'));
    expect(before.contacts.phone).toBe('[ВПИШИ]');
    expect(before.complaints).toHaveLength(1);
    expect(before.complaints[0]).toMatchObject({ id: created.id, status: 'open' });

    adminFor(test.deps).setSetting(
      'supportContacts',
      { phone: '+37300000000', email: '[ВПИШИ]', messenger: '[ВПИШИ]' },
      test.adminId,
    );
    const after = (await call(test, 'GET', '/feedback/support', test.client)).json();
    expect(after.contacts.phone).toBe('+37300000000');

    const others = (await call(test, 'GET', '/feedback/support', stranger.cookie)).json();
    expect(others.complaints).toEqual([]);
    expect((await call(test, 'GET', '/feedback/support')).statusCode).toBe(401);
  });

  it('в списке заказов для жалобы отмечено, на какие заказы жалобу уже подали', async () => {
    const test = await makeOrdersApp();
    const order = await pickedUpOrder(test);
    const other = await pickedUpOrder(test, test.client, { date: '2026-03-12' });
    await complain(test, test.client, { orderId: order.id, reason: 'other' });
    const { items } = (await call(test, 'GET', '/feedback/orders', test.client)).json();
    const byId = Object.fromEntries(
      items.map((i: { orderId: string; canComplain: boolean }) => [i.orderId, i.canComplain]),
    );
    expect(byId[order.id]).toBe(false);
    expect(byId[other.id]).toBe(true);
  });
});
