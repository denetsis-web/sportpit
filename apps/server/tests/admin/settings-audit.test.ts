import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import { auditRows, call, makeAdminApp } from './helpers.ts';

describe('настройки (R32.2, R43, R03, R33, R30.1)', () => {
  it('значения по умолчанию: 3 бокса в день, допуск ±5% по белку, запас 0%, контакты — пометка [ВПИШИ]', async () => {
    const test = await makeAdminApp();
    const admin = adminFor(test.app.deps);
    expect(admin.getSetting('maxBoxesPerDay')).toBe(3);
    expect(admin.getSetting('stockBufferPercent')).toBe(0);
    expect(admin.getSetting('toleranceNote').ru).toContain('±5%');
    expect(admin.getSetting('toleranceNote').ru).toContain('белк');
    expect(admin.getSetting('toleranceNote').ro).toContain('±5%');
    expect(admin.getSetting('labelSize')).toMatch(/^\d+x\d+$/);
    expect(admin.getSetting('supportContacts')).toEqual({
      phone: '[ВПИШИ]',
      email: '[ВПИШИ]',
      messenger: '[ВПИШИ]',
    });
    const res = await call(test.app, 'GET', '/admin/settings', test.admin);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ maxBoxesPerDay: 3, stockBufferPercent: 0 });
  });

  it('администратор меняет настройки без релиза: значение сразу читается через getSetting, изменение — в журнале', async () => {
    const test = await makeAdminApp();
    const res = await call(test.app, 'PUT', '/admin/settings', test.admin, {
      maxBoxesPerDay: 5,
      stockBufferPercent: 8,
      labelSize: '100x70',
      toleranceNote: { ru: 'Допуск ±3%', ro: 'Toleranță ±3%' },
      supportContacts: { phone: '+37300000000', email: 'a@b.test', messenger: '@x' },
    });
    expect(res.statusCode).toBe(200);
    const admin = adminFor(test.app.deps);
    expect(admin.getSetting('maxBoxesPerDay')).toBe(5);
    expect(admin.getSetting('stockBufferPercent')).toBe(8);
    expect(admin.getSetting('labelSize')).toBe('100x70');
    expect(admin.getSetting('toleranceNote')).toEqual({ ru: 'Допуск ±3%', ro: 'Toleranță ±3%' });
    expect(admin.getSetting('supportContacts').phone).toBe('+37300000000');
    const rows = auditRows(test.app);
    expect(rows.every((r) => r.user_id === test.adminId && r.action === 'settings.update')).toBe(
      true,
    );
    expect(rows.map((r) => r.target).sort()).toEqual(
      ['maxBoxesPerDay', 'stockBufferPercent', 'labelSize', 'toleranceNote', 'supportContacts']
        .map((key) => `setting:${key}`)
        .sort(),
    );
  });

  it('частичная правка не трогает остальное; неверные значения отклоняются целиком', async () => {
    const test = await makeAdminApp();
    await call(test.app, 'PUT', '/admin/settings', test.admin, { maxBoxesPerDay: 4 });
    const admin = adminFor(test.app.deps);
    expect(admin.getSetting('stockBufferPercent')).toBe(0);

    const bad = await call(test.app, 'PUT', '/admin/settings', test.admin, {
      maxBoxesPerDay: 6,
      stockBufferPercent: 150,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.stockBufferPercent).toBe('admin.error.percent');
    expect(admin.getSetting('maxBoxesPerDay')).toBe(4);
    const zero = await call(test.app, 'PUT', '/admin/settings', test.admin, { maxBoxesPerDay: 0 });
    expect(zero.statusCode).toBe(400);
    const label = await call(test.app, 'PUT', '/admin/settings', test.admin, { labelSize: 'big' });
    expect(label.statusCode).toBe(400);
    expect(auditRows(test.app)).toHaveLength(1);
  });

  it('setSetting из другого модуля пишет значение и запись в журнал; неизвестный ключ — ошибка', async () => {
    const test = await makeAdminApp();
    const admin = adminFor(test.app.deps);
    admin.setSetting('maxBoxesPerDay', 7, test.adminId);
    expect(admin.getSetting('maxBoxesPerDay')).toBe(7);
    expect(auditRows(test.app)[0]).toMatchObject({
      action: 'settings.update',
      target: 'setting:maxBoxesPerDay',
    });
    expect(() => admin.setSetting('maxBoxesPerDay', 0 as never, test.adminId)).toThrow();
    expect(() => admin.getSetting('nope' as never)).toThrow();
  });

  it('публичный ответ отдаёт допуск КБЖУ и контакты, но не служебные настройки; доступен без входа', async () => {
    const test = await makeAdminApp();
    const res = await call(test.app, 'GET', '/settings/public');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.toleranceNote.ru).toContain('±5%');
    expect(body.supportContacts.phone).toBe('[ВПИШИ]');
    expect(body.stockBufferPercent).toBeUndefined();
    expect(body.labelSize).toBeUndefined();
  });

  it('настройки только для администратора', async () => {
    const test = await makeAdminApp();
    expect((await call(test.app, 'GET', '/admin/settings', test.client)).statusCode).toBe(403);
    expect(
      (await call(test.app, 'PUT', '/admin/settings', test.client, { maxBoxesPerDay: 9 }))
        .statusCode,
    ).toBe(403);
    expect((await call(test.app, 'GET', '/admin/settings')).statusCode).toBe(401);
    expect(adminFor(test.app.deps).getSetting('maxBoxesPerDay')).toBe(3);
  });
});

describe('журнал действий администратора (R55)', () => {
  it('admin.audit пишет автора, действие, цель и подробности; API показывает новые первыми', async () => {
    const test = await makeAdminApp();
    const admin = adminFor(test.app.deps);
    admin.audit(test.adminId, 'refund.create', 'purchase:12', { credits: 3 });
    test.clock.advance(60_000);
    admin.audit(test.adminId, 'price.update', 'package:20');
    admin.audit(null, 'system.cleanup', 'jobs');

    const res = await call(test.app, 'GET', '/admin/audit', test.admin);
    expect(res.statusCode).toBe(200);
    const { items, total } = res.json();
    expect(total).toBe(3);
    expect(items.map((i: { action: string }) => i.action)).toEqual([
      'system.cleanup',
      'price.update',
      'refund.create',
    ]);
    expect(items[2]).toMatchObject({
      userId: test.adminId,
      target: 'purchase:12',
      detail: { credits: 3 },
      createdAt: '2026-03-10T09:00:00.000Z',
    });
    expect(items[0].userId).toBeNull();
    expect(items[1].createdAt).toBe('2026-03-10T09:01:00.000Z');

    const page = (await call(test.app, 'GET', '/admin/audit?limit=1&offset=1', test.admin)).json();
    expect(page.items.map((i: { action: string }) => i.action)).toEqual(['price.update']);
    expect(page.total).toBe(3);
  });

  it('журнал только для администратора и не имеет маршрутов изменения', async () => {
    const test = await makeAdminApp();
    expect((await call(test.app, 'GET', '/admin/audit', test.client)).statusCode).toBe(403);
    expect((await call(test.app, 'GET', '/admin/audit')).statusCode).toBe(401);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await call(test.app, method, '/admin/audit', test.admin, {});
      expect(res.statusCode, method).toBe(404);
    }
  });
});
