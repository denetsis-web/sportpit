import { describe, expect, it } from 'vitest';
import { adminFor } from '../../src/modules/admin/index.ts';
import { auditRows, call, createFridge, createGym, makeAdminApp } from './helpers.ts';

describe('залы (R07, R36.3)', () => {
  it('администратор создаёт зал, правит его и отключает; каждое действие попадает в журнал с автором и целью', async () => {
    const test = await makeAdminApp();
    const created = await call(test.app, 'POST', '/admin/gyms', test.admin, {
      name: 'Зал «Атлант»',
      address: 'ул. Тестовая, 1',
      sharePercent: 12.5,
    });
    expect(created.statusCode).toBe(201);
    const gym = created.json();
    expect(typeof gym.id).toBe('string');
    expect(gym).toMatchObject({ name: 'Зал «Атлант»', sharePercent: 12.5, active: true });

    const patched = await call(test.app, 'PATCH', `/admin/gyms/${gym.id}`, test.admin, {
      name: 'Зал «Атлант Плюс»',
      sharePercent: 15,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      id: gym.id,
      name: 'Зал «Атлант Плюс»',
      sharePercent: 15,
    });

    const disabled = await call(test.app, 'PATCH', `/admin/gyms/${gym.id}`, test.admin, {
      active: false,
    });
    expect(disabled.json().active).toBe(false);

    const list = (await call(test.app, 'GET', '/admin/gyms', test.admin)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: gym.id, active: false, address: 'ул. Тестовая, 1' });

    expect(auditRows(test.app).map((r) => [r.user_id, r.action, r.target])).toEqual([
      [test.adminId, 'gym.create', `gym:${gym.id}`],
      [test.adminId, 'gym.update', `gym:${gym.id}`],
      [test.adminId, 'gym.update', `gym:${gym.id}`],
    ]);
  });

  it('доля зала вне 0…100, пустое название и занятый идентификатор отклоняются; ничего не пишется в журнал', async () => {
    const test = await makeAdminApp();
    const bad = await call(test.app, 'POST', '/admin/gyms', test.admin, {
      name: 'Зал',
      sharePercent: 101,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.sharePercent).toBe('admin.error.percent');
    const noName = await call(test.app, 'POST', '/admin/gyms', test.admin, {
      name: '  ',
      sharePercent: 10,
    });
    expect(noName.statusCode).toBe(400);
    expect(noName.json().error.fields.name).toBe('admin.error.name');

    await createGym(test, { id: 'gym-one', name: 'Один', sharePercent: 10 });
    const duplicate = await call(test.app, 'POST', '/admin/gyms', test.admin, {
      id: 'gym-one',
      name: 'Другой',
      sharePercent: 10,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(auditRows(test.app)).toHaveLength(1);
    expect(
      (await call(test.app, 'PATCH', '/admin/gyms/none', test.admin, { name: 'X' })).statusCode,
    ).toBe(404);
  });

  it('клиент получает 403, без входа — 401', async () => {
    const test = await makeAdminApp();
    expect((await call(test.app, 'GET', '/admin/gyms', test.client)).statusCode).toBe(403);
    expect(
      (await call(test.app, 'POST', '/admin/gyms', test.client, { name: 'X', sharePercent: 1 }))
        .statusCode,
    ).toBe(403);
    expect((await call(test.app, 'GET', '/admin/gyms')).statusCode).toBe(401);
    expect(auditRows(test.app)).toHaveLength(0);
  });
});

describe('холодильники (R07, R45, R46)', () => {
  it('по умолчанию окно выдачи 07:00–22:00, срок приёма 18:00, замок не задан', async () => {
    const test = await makeAdminApp();
    const gym = await createGym(test);
    const res = await call(test.app, 'POST', '/admin/fridges', test.admin, {
      gymId: gym.id,
      name: 'У ресепшена',
      capacityBoxes: 30,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      gymId: gym.id,
      gymName: 'Зал «Тест»',
      name: 'У ресепшена',
      capacityBoxes: 30,
      cutoffTime: '18:00',
      pickupFrom: '07:00',
      pickupTo: '22:00',
      accessCode: null,
      active: true,
    });
  });

  it('администратор правит вместимость, окно, срок и код замка; можно очистить код и отключить холодильник', async () => {
    const test = await makeAdminApp();
    const gym = await createGym(test);
    const fridge = await createFridge(test, gym.id);
    const patched = await call(test.app, 'PATCH', `/admin/fridges/${fridge.id}`, test.admin, {
      capacityBoxes: 55,
      cutoffTime: '17:30',
      pickupFrom: '06:00',
      pickupTo: '23:00',
      accessCode: '4821',
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      capacityBoxes: 55,
      cutoffTime: '17:30',
      pickupFrom: '06:00',
      pickupTo: '23:00',
      accessCode: '4821',
    });
    const cleared = await call(test.app, 'PATCH', `/admin/fridges/${fridge.id}`, test.admin, {
      accessCode: '',
      active: false,
    });
    expect(cleared.json()).toMatchObject({ accessCode: null, active: false });
    const one = await call(test.app, 'GET', `/admin/fridges/${fridge.id}`, test.admin);
    expect(one.json().id).toBe(fridge.id);
    expect(auditRows(test.app).map((r) => r.action)).toEqual([
      'gym.create',
      'fridge.create',
      'fridge.update',
      'fridge.update',
    ]);
  });

  it('проверки: неверное время, окно наоборот, неизвестный зал, отрицательная вместимость, повтор идентификатора', async () => {
    const test = await makeAdminApp();
    const gym = await createGym(test);
    const post = (body: Record<string, unknown>) =>
      call(test.app, 'POST', '/admin/fridges', test.admin, {
        gymId: gym.id,
        name: 'Х',
        capacityBoxes: 10,
        ...body,
      });
    const badTime = await post({ pickupFrom: '25:00' });
    expect(badTime.statusCode).toBe(400);
    expect(badTime.json().error.fields.pickupFrom).toBe('admin.error.time');
    const reversed = await post({ pickupFrom: '22:00', pickupTo: '07:00' });
    expect(reversed.statusCode).toBe(400);
    expect(reversed.json().error.fields.pickupTo).toBe('admin.error.window');
    expect((await post({ gymId: 'unknown' })).statusCode).toBe(400);
    const negative = await post({ capacityBoxes: -1 });
    expect(negative.json().error.fields.capacityBoxes).toBe('admin.error.capacity');

    await createFridge(test, gym.id, { id: 'fr-main' });
    expect((await post({ id: 'fr-main' })).statusCode).toBe(409);

    // окно проверяется и при частичной правке: новое «с» позже старого «до»
    const patched = await call(test.app, 'PATCH', '/admin/fridges/fr-main', test.admin, {
      pickupFrom: '23:00',
    });
    expect(patched.statusCode).toBe(400);
  });

  it('admin.getFridge отдаёт параметры для заказов: вместимость, сроки, окно, замок, зал и его доля', async () => {
    const test = await makeAdminApp();
    const gym = await createGym(test, { name: 'Зал', sharePercent: 20 });
    const fridge = await createFridge(test, gym.id, { capacityBoxes: 25, accessCode: '777' });
    const admin = adminFor(test.app.deps);
    expect(admin.getFridge(fridge.id)).toEqual({
      id: fridge.id,
      gymId: gym.id,
      gymName: 'Зал',
      gymSharePercent: 20,
      name: 'Холодильник у входа',
      capacityBoxes: 25,
      cutoffTime: '18:00',
      pickupFrom: '07:00',
      pickupTo: '22:00',
      accessCode: '777',
      active: true,
    });
    expect(admin.getFridge('нет-такого')).toBeUndefined();
  });

  it('клиенту видны только активные холодильники активных залов и без кода замка', async () => {
    const test = await makeAdminApp();
    const shown = await createGym(test, { name: 'Виден', sharePercent: 10 });
    const hiddenGym = await createGym(test, { name: 'Скрыт', sharePercent: 10 });
    const open = await createFridge(test, shown.id, { name: 'Открыт', accessCode: '9999' });
    const off = await createFridge(test, shown.id, { name: 'Отключён' });
    const inHiddenGym = await createFridge(test, hiddenGym.id, { name: 'В скрытом зале' });
    await call(test.app, 'PATCH', `/admin/fridges/${off.id}`, test.admin, { active: false });
    await call(test.app, 'PATCH', `/admin/gyms/${hiddenGym.id}`, test.admin, { active: false });

    const list = await call(test.app, 'GET', '/fridges', test.client);
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((f: { id: string }) => f.id)).toEqual([open.id]);
    expect(JSON.stringify(list.json())).not.toContain('9999');
    expect(JSON.stringify(list.json())).not.toContain('accessCode');

    const one = await call(test.app, 'GET', `/fridges/${open.id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ id: open.id, gymName: 'Виден', pickupFrom: '07:00' });
    expect(one.json().accessCode).toBeUndefined();
    expect((await call(test.app, 'GET', `/fridges/${off.id}`)).statusCode).toBe(404);
    expect((await call(test.app, 'GET', `/fridges/${inHiddenGym.id}`)).statusCode).toBe(404);
  });

  it('только администратор: оператор и клиент не создают и не правят холодильники', async () => {
    const test = await makeAdminApp();
    const gym = await createGym(test);
    const body = { gymId: gym.id, name: 'Х', capacityBoxes: 5 };
    expect((await call(test.app, 'POST', '/admin/fridges', test.client, body)).statusCode).toBe(
      403,
    );
    expect((await call(test.app, 'GET', '/admin/fridges', test.client)).statusCode).toBe(403);
    expect((await call(test.app, 'GET', '/admin/fridges')).statusCode).toBe(401);
  });
});
