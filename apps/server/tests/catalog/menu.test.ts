import { describe, expect, it } from 'vitest';
import { catalogFor } from '../../src/modules/catalog/index.ts';
import { auditRows } from '../admin/helpers.ts';
import { call, createDish, makeAdminApp, setMenu } from './helpers.ts';

// Часы тестов стоят на 2026-03-10 09:00 UTC: в Кишинёве это 10 марта, «завтра» — 11 марта.
const TODAY = '2026-03-10';
const TOMORROW = '2026-03-11';
const DAY_AFTER = '2026-03-12';

const menu = (test: Awaited<ReturnType<typeof makeAdminApp>>, query = '', cookie?: string) =>
  call(test.app, 'GET', `/menu${query}`, cookie);

describe('меню на дату: сбор, публикация, видимость (R36.1, R18)', () => {
  it('администратор собирает меню, публикует кнопкой; до публикации клиент дня не видит', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const saved = await call(test.app, 'PUT', `/admin/menu/${TOMORROW}`, test.admin, {
      items: [{ dishId: dish.id, portionLimit: 30 }],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      date: TOMORROW,
      published: false,
      items: [{ dishId: dish.id, portionLimit: 30, reserved: 0 }],
    });

    const hidden = (await menu(test, `?date=${TOMORROW}`)).json();
    expect(hidden).toMatchObject({ date: TOMORROW, published: false, items: [] });

    const published = await call(test.app, 'POST', `/admin/menu/${TOMORROW}/publish`, test.admin);
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({ published: true });
    expect(published.json().publishedAt).toBe('2026-03-10T09:00:00.000Z');

    const shown = (await menu(test, `?date=${TOMORROW}`)).json();
    expect(shown.published).toBe(true);
    expect(shown.items).toHaveLength(1);
    expect(auditRows(test.app).map((r) => [r.action, r.target])).toEqual([
      ['dish.create', `dish:${dish.id}`],
      ['menu.save', `menu:${TOMORROW}`],
      ['menu.publish', `menu:${TOMORROW}`],
    ]);
  });

  it('карточка меню: фото-ссылка, названия RU/RO, КБЖУ, клетчатка, аллергены, вес, рейтинг «нет оценок», остаток порций', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test, { allergens: ['gluten'], goals: ['lose'] });
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 12 }]);
    const body = (await menu(test, `?date=${TOMORROW}`)).json();
    expect(body.today).toBe(TODAY);
    expect(body.toleranceNote.ru).toContain('±5%');
    expect(body.items[0]).toEqual({
      id: dish.id,
      name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
      composition: {
        ru: 'куриная грудка, рис, брокколи',
        ro: 'piept de pui, orez, broccoli',
      },
      calories: 520,
      proteinG: 42,
      fatG: 14,
      carbsG: 55,
      fiberG: 6,
      weightG: 380,
      allergens: ['gluten'],
      goals: ['lose'],
      vegetarian: false,
      shelfLifeHours: 72,
      photoUrl: null,
      rating: { avg: null, count: 0 },
      portionsLeft: 12,
      soldOut: false,
      cookedAt: null,
    });
  });

  it('без параметра date показывается завтрашний день; меню видно без входа', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 5 }]);
    const res = await menu(test);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ date: TOMORROW, published: true });
    expect((await menu(test, '?date=2026-02-30')).statusCode).toBe(400);
  });

  it('день не опубликован: published=false и ближайший опубликованный день после запрошенного', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, '2026-03-14', [{ dishId: dish.id, portionLimit: 5 }]);
    await setMenu(test, '2026-03-16', [{ dishId: dish.id, portionLimit: 5 }]);
    const body = (await menu(test, `?date=${DAY_AFTER}`)).json();
    expect(body).toMatchObject({
      date: DAY_AFTER,
      published: false,
      nextDate: '2026-03-14',
      items: [],
    });
    // у опубликованного дня ближайший — следующий за ним
    expect((await menu(test, '?date=2026-03-14')).json().nextDate).toBe('2026-03-16');
    expect((await menu(test, '?date=2026-03-16')).json().nextDate).toBeNull();
  });

  it('прошедшие дни ближайшей датой не предлагаются', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 5 }]);
    test.clock.advance(3 * 24 * 60 * 60 * 1000);
    const body = (await menu(test, '?date=2026-03-12')).json();
    expect(body).toMatchObject({ today: '2026-03-13', published: false, nextDate: null });
    // и для запроса за прошедшую дату: опубликованный, но уже прошедший день после неё — не «ближайший»
    const earlier = (await menu(test, '?date=2026-03-09')).json();
    expect(earlier).toMatchObject({ published: false, nextDate: null });
  });

  it('публиковать нельзя пустое меню и прошедший день; сохранить — тоже', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await call(test.app, 'PUT', `/admin/menu/${TOMORROW}`, test.admin, { items: [] });
    const empty = await call(test.app, 'POST', `/admin/menu/${TOMORROW}/publish`, test.admin);
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('menu_empty');
    const past = await call(test.app, 'PUT', '/admin/menu/2026-03-09', test.admin, {
      items: [{ dishId: dish.id, portionLimit: 5 }],
    });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.code).toBe('menu_past');
    expect(
      (await call(test.app, 'POST', '/admin/menu/2026-03-09/publish', test.admin)).statusCode,
    ).toBe(400);
    expect(
      (await call(test.app, 'PUT', '/admin/menu/bad-date', test.admin, { items: [] })).statusCode,
    ).toBe(400);
  });

  it('проверки состава меню: неизвестное и отключённое блюдо, повтор блюда, отрицательный лимит', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const off = await createDish(test, { nameRu: 'Снято', nameRo: 'Scos' });
    await call(test.app, 'PATCH', `/admin/dishes/${off.id}`, test.admin, { active: false });
    const put = (items: unknown[]) =>
      call(test.app, 'PUT', `/admin/menu/${TOMORROW}`, test.admin, { items });
    expect((await put([{ dishId: 9999, portionLimit: 5 }])).statusCode).toBe(400);
    expect((await put([{ dishId: off.id, portionLimit: 5 }])).statusCode).toBe(400);
    expect(
      (
        await put([
          { dishId: dish.id, portionLimit: 5 },
          { dishId: dish.id, portionLimit: 6 },
        ])
      ).statusCode,
    ).toBe(400);
    const negative = await put([{ dishId: dish.id, portionLimit: -1 }]);
    expect(negative.statusCode).toBe(400);
    expect((await put([{ dishId: dish.id, portionLimit: 5 }])).statusCode).toBe(200);
  });

  it('отключённое позже блюдо пропадает из опубликованного меню', async () => {
    const test = await makeAdminApp();
    const keep = await createDish(test);
    const drop = await createDish(test, { nameRu: 'Уходит', nameRo: 'Pleacă' });
    await setMenu(test, TOMORROW, [
      { dishId: keep.id, portionLimit: 5 },
      { dishId: drop.id, portionLimit: 5 },
    ]);
    await call(test.app, 'PATCH', `/admin/dishes/${drop.id}`, test.admin, { active: false });
    const body = (await menu(test, `?date=${TOMORROW}`)).json();
    expect(body.items.map((i: { id: number }) => i.id)).toEqual([keep.id]);
  });

  it('ротация: меню копируется с другого дня как черновик; опубликованный день не затирается', async () => {
    const test = await makeAdminApp();
    const a = await createDish(test);
    const b = await createDish(test, { nameRu: 'Лосось', nameRo: 'Somon' });
    await setMenu(test, TOMORROW, [
      { dishId: a.id, portionLimit: 10 },
      { dishId: b.id, portionLimit: 20 },
    ]);
    const copied = await call(test.app, 'POST', `/admin/menu/${DAY_AFTER}/copy`, test.admin, {
      fromDate: TOMORROW,
    });
    expect(copied.statusCode).toBe(200);
    expect(copied.json()).toMatchObject({
      date: DAY_AFTER,
      published: false,
      items: [
        { dishId: a.id, portionLimit: 10 },
        { dishId: b.id, portionLimit: 20 },
      ],
    });
    expect((await menu(test, `?date=${DAY_AFTER}`)).json().published).toBe(false);
    const again = await call(test.app, 'POST', `/admin/menu/${TOMORROW}/copy`, test.admin, {
      fromDate: DAY_AFTER,
    });
    expect(again.statusCode).toBe(409);
    expect(auditRows(test.app).map((r) => r.action)).toContain('menu.copy');
    const noSource = await call(test.app, 'POST', `/admin/menu/${DAY_AFTER}/copy`, test.admin, {
      fromDate: '2026-04-01',
    });
    expect(noSource.statusCode).toBe(404);
  });

  it('список дней для администратора: статус и число блюд за период', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 5 }]);
    await setMenu(test, DAY_AFTER, [{ dishId: dish.id, portionLimit: 5 }], false);
    const res = await call(
      test.app,
      'GET',
      `/admin/menu?from=${TOMORROW}&to=2026-03-20`,
      test.admin,
    );
    expect(res.json().items).toEqual([
      { date: TOMORROW, published: true, itemCount: 1 },
      { date: DAY_AFTER, published: false, itemCount: 1 },
    ]);
    const one = await call(test.app, 'GET', `/admin/menu/${TOMORROW}`, test.admin);
    expect(one.json().items).toHaveLength(1);
    const empty = await call(test.app, 'GET', '/admin/menu/2026-03-25', test.admin);
    expect(empty.json()).toEqual({
      date: '2026-03-25',
      published: false,
      publishedAt: null,
      items: [],
    });
  });

  it('меню администратора закрыто: клиент 403, без входа 401', async () => {
    const test = await makeAdminApp();
    for (const [method, url] of [
      ['GET', `/admin/menu/${TOMORROW}`],
      ['PUT', `/admin/menu/${TOMORROW}`],
      ['POST', `/admin/menu/${TOMORROW}/publish`],
    ] as const) {
      expect((await call(test.app, method, url, test.client, { items: [] })).statusCode, url).toBe(
        403,
      );
      expect((await call(test.app, method, url, undefined, { items: [] })).statusCode, url).toBe(
        401,
      );
    }
    // публичные пути меню не отдают закрытых данных администратора (кэш service worker)
    const body = JSON.stringify((await menu(test)).json());
    expect(body).not.toContain('portionLimit');
  });
});

describe('остаток порций и «Закончилось» (R18.3)', () => {
  it('по умолчанию занято 0; поставщик занятых порций уменьшает остаток; при нуле блюдо «Закончилось»', async () => {
    const test = await makeAdminApp();
    const a = await createDish(test);
    const b = await createDish(test, { nameRu: 'Лосось', nameRo: 'Somon' });
    await setMenu(test, TOMORROW, [
      { dishId: a.id, portionLimit: 10 },
      { dishId: b.id, portionLimit: 4 },
    ]);
    const catalog = catalogFor(test.app.deps);
    expect(catalog.portionsLeft(TOMORROW, a.id)).toBe(10);

    const reserved: Record<string, number> = {
      [`${TOMORROW}:${a.id}`]: 3,
      [`${TOMORROW}:${b.id}`]: 4,
    };
    catalog.registerReservedProvider((date, dishId) => reserved[`${date}:${dishId}`] ?? 0);
    expect(catalog.portionsLeft(TOMORROW, a.id)).toBe(7);
    expect(catalog.portionsLeft(TOMORROW, b.id)).toBe(0);

    const items = (await menu(test, `?date=${TOMORROW}`)).json().items;
    const byId = Object.fromEntries(items.map((i: { id: number }) => [i.id, i]));
    expect(byId[a.id]).toMatchObject({ portionsLeft: 7, soldOut: false });
    expect(byId[b.id]).toMatchObject({ portionsLeft: 0, soldOut: true });
  });

  it('занято больше лимита не уходит в минус; блюдо вне меню и неопубликованный день — 0 порций', async () => {
    const test = await makeAdminApp();
    const a = await createDish(test);
    const other = await createDish(test, { nameRu: 'Другое', nameRo: 'Altul' });
    await setMenu(test, TOMORROW, [{ dishId: a.id, portionLimit: 2 }]);
    await setMenu(test, DAY_AFTER, [{ dishId: a.id, portionLimit: 9 }], false);
    const catalog = catalogFor(test.app.deps);
    catalog.registerReservedProvider(() => 5);
    expect(catalog.portionsLeft(TOMORROW, a.id)).toBe(0);
    catalog.registerReservedProvider(() => 0);
    expect(catalog.portionsLeft(TOMORROW, other.id)).toBe(0);
    expect(catalog.portionsLeft(DAY_AFTER, a.id)).toBe(0);
    expect(catalog.portionsLeft('2026-04-01', a.id)).toBe(0);
  });

  it('при правке опубликованного меню лимит не опускается ниже занятого, а занятое блюдо не убирается', async () => {
    const test = await makeAdminApp();
    const a = await createDish(test);
    const b = await createDish(test, { nameRu: 'Лосось', nameRo: 'Somon' });
    await setMenu(test, TOMORROW, [
      { dishId: a.id, portionLimit: 10 },
      { dishId: b.id, portionLimit: 10 },
    ]);
    catalogFor(test.app.deps).registerReservedProvider((_date, dishId) =>
      dishId === a.id ? 6 : 0,
    );
    const put = (items: unknown[]) =>
      call(test.app, 'PUT', `/admin/menu/${TOMORROW}`, test.admin, { items });
    const lower = await put([
      { dishId: a.id, portionLimit: 5 },
      { dishId: b.id, portionLimit: 10 },
    ]);
    expect(lower.statusCode).toBe(409);
    expect(lower.json().error.code).toBe('portions_reserved');
    const removed = await put([{ dishId: b.id, portionLimit: 10 }]);
    expect(removed.statusCode).toBe(409);
    const ok = await put([
      { dishId: a.id, portionLimit: 6 },
      { dishId: b.id, portionLimit: 1 },
    ]);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().items.find((i: { dishId: number }) => i.dishId === a.id).reserved).toBe(6);
  });

  it('время приготовления берётся у поставщика кухни, если он зарегистрирован', async () => {
    const test = await makeAdminApp();
    const a = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: a.id, portionLimit: 10 }]);
    catalogFor(test.app.deps).registerCookedAtProvider(() => '2026-03-10T20:00:00.000Z');
    const item = (await menu(test, `?date=${TOMORROW}`)).json().items[0];
    expect(item.cookedAt).toBe('2026-03-10T20:00:00.000Z');
  });
});

describe('фильтры меню (R18.1)', () => {
  async function seeded() {
    const test = await makeAdminApp();
    const chicken = await createDish(test, {
      nameRu: 'Курица',
      nameRo: 'Pui',
      proteinG: 45,
      goals: ['maintain', 'gain'],
      allergens: ['gluten'],
    });
    const salad = await createDish(test, {
      nameRu: 'Салат',
      nameRo: 'Salată',
      proteinG: 18,
      goals: ['lose'],
      vegetarian: true,
      allergens: [],
    });
    const cheese = await createDish(test, {
      nameRu: 'Сырники',
      nameRo: 'Papanași',
      proteinG: 30,
      goals: ['maintain'],
      vegetarian: true,
      allergens: ['lactose', 'eggs'],
    });
    const fish = await createDish(test, {
      nameRu: 'Лосось',
      nameRo: 'Somon',
      proteinG: 38,
      goals: ['lose', 'gain'],
      allergens: ['fish'],
    });
    await setMenu(test, TOMORROW, [
      { dishId: chicken.id, portionLimit: 5 },
      { dishId: salad.id, portionLimit: 5 },
      { dishId: cheese.id, portionLimit: 5 },
      { dishId: fish.id, portionLimit: 5 },
    ]);
    const ids = async (query: string) =>
      (
        (await menu(test, `?date=${TOMORROW}${query}`)).json().items as Array<{
          name: { ru: string };
        }>
      )
        .map((i) => i.name.ru)
        .sort();
    return { test, ids };
  }

  it('по цели, по белку от X г, без глютена, без лактозы, вегетарианское', async () => {
    const { ids } = await seeded();
    expect(await ids('&goal=lose')).toEqual(['Лосось', 'Салат']);
    expect(await ids('&goal=gain')).toEqual(['Курица', 'Лосось']);
    expect(await ids('&proteinMin=38')).toEqual(['Курица', 'Лосось']);
    expect(await ids('&proteinMin=45')).toEqual(['Курица']);
    expect(await ids('&glutenFree=1')).toEqual(['Лосось', 'Салат', 'Сырники']);
    expect(await ids('&lactoseFree=1')).toEqual(['Курица', 'Лосось', 'Салат']);
    expect(await ids('&vegetarian=1')).toEqual(['Салат', 'Сырники']);
    expect(await ids('&glutenFree=0')).toHaveLength(4);
  });

  it('фильтры сочетаются по «И»', async () => {
    const { ids } = await seeded();
    expect(await ids('&goal=lose&vegetarian=1')).toEqual(['Салат']);
    expect(await ids('&proteinMin=30&lactoseFree=1&glutenFree=1')).toEqual(['Лосось']);
    expect(await ids('&goal=gain&vegetarian=1')).toEqual([]);
  });

  it('listMenu(date, filters) даёт тот же результат, что и запрос', async () => {
    const { test } = await seeded();
    const result = catalogFor(test.app.deps).listMenu(TOMORROW, { goal: 'lose', proteinMin: 30 });
    expect(result.items.map((i) => i.name.ru)).toEqual(['Лосось']);
    expect(result.published).toBe(true);
  });

  it('неверное значение фильтра — 400', async () => {
    const { test } = await seeded();
    expect((await menu(test, `?date=${TOMORROW}&goal=bulk`)).statusCode).toBe(400);
    expect((await menu(test, `?date=${TOMORROW}&proteinMin=abc`)).statusCode).toBe(400);
  });
});

describe('карточка блюда (R19)', () => {
  it('состав, КБЖУ, вес, рейтинг, отзывы без автора и остаток порций на дату', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 8 }]);
    const catalog = catalogFor(test.app.deps);
    catalog.applyRating(dish.id, 5, null);
    catalog.registerReviewsProvider((dishId, limit) => {
      expect(dishId).toBe(dish.id);
      expect(limit).toBeGreaterThan(0);
      return [
        {
          stars: 5,
          tag: 'taste',
          createdAt: '2026-03-09T18:00:00.000Z',
          phone: '+37360123456',
        } as never,
      ];
    });
    const res = await call(test.app, 'GET', `/dishes/${dish.id}?date=${TOMORROW}`);
    expect(res.statusCode).toBe(200);
    const card = res.json();
    expect(card.dish).toMatchObject({
      id: dish.id,
      composition: { ru: 'куриная грудка, рис, брокколи' },
      weightG: 380,
      rating: { avg: 5, count: 1 },
      portionsLeft: 8,
      soldOut: false,
      onMenu: true,
    });
    expect(card.reviews).toEqual([
      { stars: 5, tag: 'taste', createdAt: '2026-03-09T18:00:00.000Z' },
    ]);
    expect(JSON.stringify(card)).not.toContain('+373');
    expect(card.toleranceNote.ru).toContain('±5%');
  });

  it('без даты и вне меню: карточка есть, onMenu=false, порций нет; отключённое и неизвестное блюдо — 404', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const card = (await call(test.app, 'GET', `/dishes/${dish.id}`)).json();
    expect(card).toMatchObject({
      dish: { onMenu: false, portionsLeft: 0, soldOut: true },
      reviews: [],
    });
    await call(test.app, 'PATCH', `/admin/dishes/${dish.id}`, test.admin, { active: false });
    expect((await call(test.app, 'GET', `/dishes/${dish.id}`)).statusCode).toBe(404);
    expect((await call(test.app, 'GET', '/dishes/9999')).statusCode).toBe(404);
    expect((await call(test.app, 'GET', '/dishes/abc')).statusCode).toBe(404);
  });
});
