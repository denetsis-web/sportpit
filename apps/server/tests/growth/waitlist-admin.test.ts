// Лист ожидания для администратора: права, фильтры и страницы, отметки пути, CSV, удаление.
import { describe, expect, it } from 'vitest';
import {
  addPaidPurchase,
  ANON_A,
  ANON_B,
  attribution,
  countRows,
  DAY,
  del,
  get,
  HOUR,
  joinBody,
  login,
  makeAdminApp,
  OTHER_PHONE,
  phoneN,
  post,
  setRole,
  signUp,
  type TestApp,
} from './helpers.ts';

interface Item {
  id: number;
  phone: string;
  name: string | null;
  source: string;
  path: { usedCalc: boolean; signedUp: boolean; purchased: boolean } | null;
}

const join = (test: TestApp, n: number, extra: Record<string, unknown> = {}) =>
  post(test, '/waitlist', joinBody({ phone: phoneN(n), ...extra }), { ip: `10.1.0.${n % 250}` });

const list = async (test: TestApp & { admin: string }, query = '') => {
  const res = await get(test, `/admin/waitlist${query}`, { cookie: test.admin });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { items: Item[]; total: number; page: number; pageSize: number };
};

describe('права на экраны администратора', () => {
  it('без входа — 401, клиент и оператор — 403, администратор — 200', async () => {
    const test = await makeAdminApp();
    const client = await login(test, OTHER_PHONE);
    const operatorPhone = '+37360999111';
    const operator = await login(test, operatorPhone);
    setRole(test.app, operatorPhone, 'operator');
    for (const url of ['/admin/waitlist', '/admin/waitlist/csv', '/admin/funnel']) {
      expect((await get(test, url)).statusCode, url).toBe(401);
      expect((await get(test, url, { cookie: client })).statusCode, url).toBe(403);
      expect((await get(test, url, { cookie: operator })).statusCode, url).toBe(403);
      expect((await get(test, url, { cookie: test.admin })).statusCode, url).toBe(200);
    }
    const id = 1;
    expect((await del(test, `/admin/waitlist/${id}`)).statusCode).toBe(401);
    expect((await del(test, `/admin/waitlist/${id}`, { cookie: client })).statusCode).toBe(403);
    expect((await del(test, `/admin/waitlist/${id}`, { cookie: operator })).statusCode).toBe(403);
  });
});

describe('GET /admin/waitlist: список, фильтры, страницы', () => {
  it('пустой список — нули, а не ошибка', async () => {
    const test = await makeAdminApp();
    expect(await list(test)).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });

  it('поля записи без анонимного номера; новые записи сверху', async () => {
    const test = await makeAdminApp();
    await join(test, 1, { name: 'Анна', gym: 'Ботаника', goal: 'lose' });
    test.clock.advance(HOUR);
    await join(test, 2, {
      lang: 'ro',
      attribution: attribution({ source: 'trainer', ref: 'ion', campaign: 'nov' }),
    });
    const { items, total } = await list(test);
    expect(total).toBe(2);
    expect(items.map((item) => item.phone)).toEqual([phoneN(2), phoneN(1)]);
    expect(items[1]).toEqual({
      id: expect.any(Number),
      phone: phoneN(1),
      name: 'Анна',
      gym: 'Ботаника',
      goal: 'lose',
      lang: 'ru',
      source: 'direct',
      ref: null,
      campaign: null,
      createdAt: '2026-03-10T09:00:00.000Z',
      path: null,
    });
    expect(items[0]).toMatchObject({ lang: 'ro', source: 'trainer', ref: 'ion', campaign: 'nov' });
  });

  it('фильтры: номер или имя без учёта регистра (в том числе кириллицы), зал, цель, язык, источник', async () => {
    const test = await makeAdminApp();
    await join(test, 1, { name: 'Анна Петрова', gym: 'Ботаника, зал «Атлант»', goal: 'lose' });
    await join(test, 2, { name: 'Ion', gym: 'Рышкановка', goal: 'gain', lang: 'ro' });
    await join(test, 3, {
      gym: 'Чеканы',
      attribution: attribution({ source: 'ig' }),
    });
    const phones = async (query: string) =>
      (await list(test, query)).items.map((item) => item.phone).sort();

    expect(await phones(`?q=${encodeURIComponent('анна')}`)).toEqual([phoneN(1)]);
    expect(await phones(`?q=${encodeURIComponent('ПЕТР')}`)).toEqual([phoneN(1)]);
    expect(await phones('?q=ION')).toEqual([phoneN(2)]);
    expect(await phones(`?q=${encodeURIComponent('+373 6 000 0003')}`)).toEqual([phoneN(3)]);
    expect(await phones(`?q=${encodeURIComponent(phoneN(2).slice(-4))}`)).toEqual([phoneN(2)]);
    expect(await phones(`?gym=${encodeURIComponent('АТЛАНТ')}`)).toEqual([phoneN(1)]);
    expect(await phones('?goal=gain')).toEqual([phoneN(2)]);
    expect(await phones('?lang=ro')).toEqual([phoneN(2)]);
    expect(await phones('?source=ig')).toEqual([phoneN(3)]);
    expect(await phones('?source=gym')).toEqual([]);
    // пустые значения формы фильтров не ломают запрос и ничего не отсекают
    expect(await phones('?q=&gym=&goal=&lang=&source=&from=&to=')).toHaveLength(3);
    // совпадение по нескольким условиям сразу
    expect(await phones('?lang=ru&source=ig')).toEqual([phoneN(3)]);
  });

  it('период по дню записи (Кишинёв), обе границы включительно', async () => {
    const test = await makeAdminApp();
    await join(test, 1); // 2026-03-10 11:00 по Кишинёву
    test.clock.advance(DAY);
    await join(test, 2); // 2026-03-11
    test.clock.advance(DAY);
    await join(test, 3); // 2026-03-12
    const phones = async (query: string) =>
      (await list(test, query)).items.map((item) => item.phone).sort();
    expect(await phones('?from=2026-03-11&to=2026-03-11')).toEqual([phoneN(2)]);
    expect(await phones('?from=2026-03-11')).toEqual([phoneN(2), phoneN(3)]);
    expect(await phones('?to=2026-03-10')).toEqual([phoneN(1)]);
    const bad = await get(test, '/admin/waitlist?from=2026-03-12&to=2026-03-10', {
      cookie: test.admin,
    });
    expect(bad.statusCode).toBe(400);
    expect((await get(test, '/admin/waitlist?from=вчера', { cookie: test.admin })).statusCode).toBe(
      400,
    );
  });

  it('страницы по 50: на первой 50, на второй остаток, всего считается по фильтру', async () => {
    const test = await makeAdminApp();
    for (let n = 1; n <= 53; n++) await join(test, n);
    const first = await list(test);
    expect(first).toMatchObject({ total: 53, page: 1, pageSize: 50 });
    expect(first.items).toHaveLength(50);
    const second = await list(test, '?page=2');
    expect(second.page).toBe(2);
    expect(second.items).toHaveLength(3);
    const seen = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(seen.size).toBe(53);
    expect((await get(test, '/admin/waitlist?page=0', { cookie: test.admin })).statusCode).toBe(
      400,
    );
  });
});

describe('отметки пути человека', () => {
  it('по анонимному номеру: считал норму, зарегистрировался, купил; без номера — null; номер наружу не отдаётся', async () => {
    const test = await makeAdminApp();
    // A: записался, считал норму, зарегистрировался и купил
    await join(test, 1, { attribution: attribution({ anonId: ANON_A }) });
    await post(test, '/track', {
      kind: 'calc_used',
      attribution: attribution({ anonId: ANON_A }),
    });
    const buyer = await signUp(test, phoneN(900), attribution({ anonId: ANON_A }));
    addPaidPurchase(test, buyer.id, '2026-03-10T10:00:00.000Z');
    // B: записался и только считал норму
    await join(test, 2, { attribution: attribution({ anonId: ANON_B }) });
    await post(test, '/track', {
      kind: 'calc_used',
      attribution: attribution({ anonId: ANON_B }),
    });
    // C: записался с номером, больше ничего не делал; D: без номера вообще
    await join(test, 3, {
      attribution: attribution({ anonId: '6b6f0e2d-9c1a-4d77-8e55-1f0a2b3c4d5e' }),
    });
    await join(test, 4);

    const res = await get(test, '/admin/waitlist', { cookie: test.admin });
    const byPhone = new Map((res.json().items as Item[]).map((item) => [item.phone, item.path]));
    expect(byPhone.get(phoneN(1))).toEqual({ usedCalc: true, signedUp: true, purchased: true });
    expect(byPhone.get(phoneN(2))).toEqual({ usedCalc: true, signedUp: false, purchased: false });
    expect(byPhone.get(phoneN(3))).toEqual({ usedCalc: false, signedUp: false, purchased: false });
    expect(byPhone.get(phoneN(4))).toBeNull();
    expect(res.body).not.toMatch(/anon/i);
    expect(res.body).not.toContain(ANON_A);
  });

  it('регистрация без оплаты: зарегистрировался, но не купил; неоплаченная покупка не считается', async () => {
    const test = await makeAdminApp();
    await join(test, 1, { attribution: attribution({ anonId: ANON_A }) });
    const user = await signUp(test, phoneN(900), attribution({ anonId: ANON_A }));
    test.app.deps.db.run(
      `INSERT INTO purchases (user_id, package_id, boxes, validity_days, list_price_per_box_bani,
         unit_price_bani, total_bani, method, status, idempotency_key, created_at, updated_at)
       VALUES (?, 1, 12, 45, 11900, 11900, 142800, 'card', 'pending', 'k-pending', 'x', 'x')`,
      [user.id],
    );
    const { items } = await list(test);
    expect(items[0]!.path).toEqual({ usedCalc: false, signedUp: true, purchased: false });
  });
});

describe('GET /admin/waitlist/csv', () => {
  it('файл для Excel: тип, BOM, имя файла, колонки источника; телефон не становится формулой', async () => {
    const test = await makeAdminApp();
    await join(test, 1, {
      name: '=HYPERLINK("x")',
      gym: 'Ботаника; зал',
      goal: 'gain',
      attribution: attribution({ source: 'gym', ref: 'botanica', campaign: 'poster' }),
    });
    const res = await get(test, '/admin/waitlist/csv?labels=ru', { cookie: test.admin });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="sportpit-waitlist-2026-03-10.csv"',
    );
    expect(res.body.startsWith('﻿')).toBe(true);
    const [header, row] = res.body.slice(1).split('\r\n');
    expect(header).toBe('Когда;Телефон;Имя;Зал или район;Цель;Язык;Источник;Метка;Кампания');
    // Ячейки: дата по Кишинёву; телефон и имя с «+» и «=» защищены апострофом; текст с «;» — в кавычках.
    expect(row).toBe(
      [
        '10.03.2026 11:00',
        `'${phoneN(1)}`,
        `"'=HYPERLINK(""x"")"`,
        '"Ботаника; зал"',
        'Набор массы',
        'ru',
        'gym',
        'botanica',
        'poster',
      ].join(';'),
    );
    expect(res.body).not.toMatch(/anon/i);
  });

  it('те же фильтры, что у списка; заголовки на языке из labels, а без него — из Accept-Language', async () => {
    const test = await makeAdminApp();
    await join(test, 1, { lang: 'ru' });
    await join(test, 2, { lang: 'ro' });
    const ro = await get(test, '/admin/waitlist/csv?lang=ro&labels=ro', { cookie: test.admin });
    const lines = ro.body.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Când;Telefon;Nume;Sală sau sector;Obiectiv;Limba;Sursa;Marcaj;Campania');
    expect(lines[1]).toContain(phoneN(2));
    const byHeader = await get(test, '/admin/waitlist/csv', {
      cookie: test.admin,
      headers: { 'accept-language': 'ro-RO,ro;q=0.9' },
    });
    expect(byHeader.body.slice(1).split('\r\n')[0]).toContain('Telefon');
  });
});

describe('DELETE /admin/waitlist/:id', () => {
  it('удаляет запись, отвечает 204 и пишет строку в журнал действий без телефона', async () => {
    const test = await makeAdminApp();
    await join(test, 1);
    await join(test, 2);
    const { items } = await list(test);
    const target = items.find((item) => item.phone === phoneN(1))!;
    const res = await del(test, `/admin/waitlist/${target.id}`, { cookie: test.admin });
    expect(res.statusCode).toBe(204);
    expect((await list(test)).items.map((item) => item.phone)).toEqual([phoneN(2)]);
    const audit = test.app.deps.db.query<{ action: string; target: string; detail: string | null }>(
      `SELECT action, target, detail FROM admin_audit WHERE action = 'waitlist.delete'`,
    );
    expect(audit).toEqual([
      { action: 'waitlist.delete', target: `waitlist:${target.id}`, detail: null },
    ]);
    // человек может записаться снова: старая запись не мешает
    expect((await join(test, 1)).statusCode).toBe(200);
    expect(countRows(test, 'waitlist_entries')).toBe(2);
  });

  it('несуществующий или неверный id — 404, журнал пуст', async () => {
    const test = await makeAdminApp();
    expect((await del(test, '/admin/waitlist/999', { cookie: test.admin })).statusCode).toBe(404);
    expect((await del(test, '/admin/waitlist/abc', { cookie: test.admin })).statusCode).toBe(404);
    expect(
      test.app.deps.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'waitlist.delete'`,
      )!.n,
    ).toBe(0);
  });
});
