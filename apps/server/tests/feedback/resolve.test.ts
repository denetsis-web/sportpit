import { describe, expect, it } from 'vitest';
import { auditRows } from '../admin/helpers.ts';
import { addClient, balanceApi, buyPaid, journalSum, ledgerRows } from '../billing/helpers.ts';
import {
  call,
  complain,
  jpegFile,
  makeOrdersApp,
  pickedUpOrder,
  type OrdersTest,
} from './helpers.ts';

async function openComplaint(test: OrdersTest, cookie = test.client, userId = test.clientId) {
  const order = await pickedUpOrder(test, cookie);
  const res = await complain(test, cookie, {
    orderId: order.id,
    dishId: test.dishes[0],
    reason: 'spoiled',
    description: 'Не свежее',
    file: jpegFile(),
  });
  expect(res.statusCode).toBe(201);
  return { complaint: res.json().complaint as { id: string }, order, userId };
}

const resolve = (test: OrdersTest, id: string, body: object, cookie = test.admin) =>
  call(test, 'POST', `/admin/complaints/${id}/resolve`, cookie, body);

const noticesOf = (test: OrdersTest, userId: number) =>
  test.deps.db
    .query<{ type: string; payload: string }>(
      `SELECT type, payload FROM notifications WHERE user_id = ? AND type = 'complaint_resolved' ORDER BY id`,
      [userId],
    )
    .map((n) => ({ type: n.type, payload: JSON.parse(n.payload) as Record<string, string> }));

describe('очередь жалоб администратора (R38)', () => {
  it('показывает открытые жалобы с фото, блюдами заказа и залом; клиенту и гостю закрыта', async () => {
    const test = await makeOrdersApp();
    const { complaint, order } = await openComplaint(test);
    const res = await call(test, 'GET', '/admin/complaints', test.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.openCount).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: complaint.id,
      orderId: order.id,
      userId: test.clientId,
      reason: 'spoiled',
      status: 'open',
    });
    expect(body.items[0].photos).toHaveLength(1);
    expect(body.items[0].items[0]).toMatchObject({ dishId: test.dishes[0], qty: 1 });
    expect(body.items[0].gymName).toBeTruthy();
    // в очереди администратора нет телефона клиента
    expect(res.body).not.toMatch(/\+373\d{8}/);

    expect((await call(test, 'GET', '/admin/complaints', test.client)).statusCode).toBe(403);
    expect((await call(test, 'GET', '/admin/complaints')).statusCode).toBe(401);
    expect((await resolve(test, complaint.id, { outcome: 'refund' }, test.client)).statusCode).toBe(
      403,
    );
  });

  it('фильтр «все» показывает и решённые, «открытые» — только ожидающие', async () => {
    const test = await makeOrdersApp();
    const { complaint } = await openComplaint(test);
    await resolve(test, complaint.id, { outcome: 'refund' });
    const open = (await call(test, 'GET', '/admin/complaints?status=open', test.admin)).json();
    expect(open.items).toEqual([]);
    expect(open.openCount).toBe(0);
    const all = (await call(test, 'GET', '/admin/complaints?status=all', test.admin)).json();
    expect(all.items.map((i: { id: string }) => i.id)).toEqual([complaint.id]);
  });
});

describe('решения по жалобе (R38, R44, R44.1)', () => {
  it('«замена другим блюдом»: +1 кредит записью complaint_credit, пометка replacement, уведомление «выберите блюдо на любой день»', async () => {
    const test = await makeOrdersApp();
    const { complaint } = await openComplaint(test);
    const before = await balanceApi(test, test.client);
    const res = await resolve(test, complaint.id, { outcome: 'replacement' });
    expect(res.statusCode).toBe(200);
    expect(res.json().complaint).toMatchObject({
      status: 'resolved',
      outcome: 'replacement',
    });
    expect(res.json().complaint.history.map((e: { kind: string }) => e.kind)).toEqual([
      'created',
      'replacement',
    ]);

    expect(await balanceApi(test, test.client)).toBe(before + 1);
    const credit = ledgerRows(test, test.clientId).filter((r) => r.reason === 'complaint_credit');
    expect(credit).toHaveLength(1);
    expect(credit[0]).toMatchObject({ delta: 1 });
    const linked = test.deps.db.get<{ complaint_id: string }>(
      `SELECT complaint_id FROM credit_ledger WHERE reason = 'complaint_credit' AND user_id = ?`,
      [test.clientId],
    )!;
    expect(linked.complaint_id).toBe(complaint.id);
    expect(journalSum(test, test.clientId)).toBe(before + 1);

    // отдельного заказа-замены нет: заказов у клиента столько же, сколько было
    expect(test.deps.db.query('SELECT id FROM orders')).toHaveLength(1);

    const [notice] = noticesOf(test, test.clientId);
    expect(notice!.payload).toMatchObject({
      complaintId: complaint.id,
      outcome: 'replacement',
      link: '/support',
    });
    expect(notice!.payload.text).toContain('любой день');
  });

  it('«возврат кредита»: тоже +1 кредит, пометка refund и другой текст уведомления', async () => {
    const test = await makeOrdersApp();
    const { complaint } = await openComplaint(test);
    const before = await balanceApi(test, test.client);
    const res = await resolve(test, complaint.id, { outcome: 'refund' });
    expect(res.statusCode).toBe(200);
    expect(res.json().complaint).toMatchObject({ status: 'resolved', outcome: 'refund' });
    expect(res.json().complaint.history.map((e: { kind: string }) => e.kind)).toEqual([
      'created',
      'refund',
    ]);
    expect(await balanceApi(test, test.client)).toBe(before + 1);
    const [notice] = noticesOf(test, test.clientId);
    expect(notice!.payload.outcome).toBe('refund');
    expect(notice!.payload.text).toContain('кредит');
    expect(notice!.payload.text).not.toContain('любой день');
  });

  it('тексты уведомлений идут на языке клиента (румынский)', async () => {
    const test = await makeOrdersApp();
    test.deps.db.run(`UPDATE users SET lang = 'ro' WHERE id = ?`, [test.clientId]);
    const { complaint } = await openComplaint(test);
    await resolve(test, complaint.id, { outcome: 'replacement' });
    const [notice] = noticesOf(test, test.clientId);
    expect(notice!.payload.text).not.toMatch(/[а-яё]/i);
    expect(notice!.payload.text.length).toBeGreaterThan(10);
  });

  it('«отказ» требует комментарий, кредит не начисляется, клиент видит причину отказа', async () => {
    const test = await makeOrdersApp();
    const { complaint } = await openComplaint(test);
    const before = await balanceApi(test, test.client);
    const bare = await resolve(test, complaint.id, { outcome: 'reject' });
    expect(bare.statusCode).toBe(400);
    expect(bare.json().error.fields.comment).toBe('feedback.error.commentRequired');
    const blank = await resolve(test, complaint.id, { outcome: 'reject', comment: '  ' });
    expect(blank.statusCode).toBe(400);
    expect((await call(test, 'GET', '/admin/complaints', test.admin)).json().openCount).toBe(1);

    const res = await resolve(test, complaint.id, {
      outcome: 'reject',
      comment: 'Фото не подтверждает проблему',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().complaint).toMatchObject({
      status: 'rejected',
      outcome: 'reject',
      comment: 'Фото не подтверждает проблему',
    });
    expect(await balanceApi(test, test.client)).toBe(before);
    expect(ledgerRows(test, test.clientId).filter((r) => r.reason === 'complaint_credit')).toEqual(
      [],
    );
    const support = (await call(test, 'GET', '/feedback/support', test.client)).json();
    expect(support.complaints[0]).toMatchObject({
      status: 'rejected',
      comment: 'Фото не подтверждает проблему',
    });
    expect(support.complaints[0].history.map((e: { kind: string }) => e.kind)).toEqual([
      'created',
      'rejected',
    ]);
    const [notice] = noticesOf(test, test.clientId);
    expect(notice!.payload).toMatchObject({ outcome: 'reject' });
    expect(notice!.payload.text).toContain('Фото не подтверждает проблему');
  });

  it('второе решение по той же жалобе — 409, кредит не удваивается', async () => {
    const test = await makeOrdersApp();
    const { complaint } = await openComplaint(test);
    await resolve(test, complaint.id, { outcome: 'refund' });
    const before = await balanceApi(test, test.client);
    const again = await resolve(test, complaint.id, { outcome: 'replacement' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('complaint_closed');
    expect(await balanceApi(test, test.client)).toBe(before);
    expect(noticesOf(test, test.clientId)).toHaveLength(1);
  });

  it('неизвестная жалоба — 404; неверный исход — 400', async () => {
    const test = await makeOrdersApp();
    const { complaint } = await openComplaint(test);
    expect((await resolve(test, 'no-such-id', { outcome: 'refund' })).statusCode).toBe(404);
    const bad = await resolve(test, complaint.id, { outcome: 'refund_all' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.outcome).toBeDefined();
  });

  it('каждое решение пишется в журнал действий администратора', async () => {
    const test = await makeOrdersApp();
    const first = await openComplaint(test);
    const stranger = await addClient(test);
    await buyPaid(test, stranger.cookie, 12);
    const second = await openComplaint(test, stranger.cookie, stranger.id);
    const before = auditRows(test.app).length;
    await resolve(test, first.complaint.id, { outcome: 'replacement' });
    await resolve(test, second.complaint.id, { outcome: 'reject', comment: 'Нет оснований' });
    const rows = auditRows(test.app)
      .slice(before)
      .filter((r) => r.action === 'complaint.resolve');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: test.adminId,
      target: `complaint:${first.complaint.id}`,
    });
    expect(JSON.parse(rows[0]!.detail!)).toMatchObject({ outcome: 'replacement' });
    expect(JSON.parse(rows[1]!.detail!)).toMatchObject({ outcome: 'reject' });
  });

  it('после отказа на тот же заказ можно подать новую жалобу, после решения с кредитом — нельзя', async () => {
    const test = await makeOrdersApp();
    const { complaint, order } = await openComplaint(test);
    await resolve(test, complaint.id, { outcome: 'reject', comment: 'Недостаточно данных' });
    const again = await complain(test, test.client, { orderId: order.id, reason: 'kbzhu' });
    expect(again.statusCode).toBe(201);
    await resolve(test, again.json().complaint.id, { outcome: 'refund' });
    const third = await complain(test, test.client, { orderId: order.id, reason: 'other' });
    expect(third.statusCode).toBe(409);
  });
});
