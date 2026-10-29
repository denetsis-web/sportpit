import { describe, expect, it } from 'vitest';
import { catalogFor } from '../../src/modules/catalog/index.ts';
import { call, createDish, makeAdminApp, setMenu } from './helpers.ts';

const TOMORROW = '2026-03-11';

describe('рейтинг блюда: getDishRating и applyRating (контракт с модулем обратной связи)', () => {
  it('пока оценок нет — avg null и count 0, и в меню, и в getDishRating', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const catalog = catalogFor(test.app.deps);
    expect(catalog.getDishRating(dish.id)).toEqual({ avg: null, count: 0 });
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 3 }]);
    const item = (await call(test.app, 'GET', `/menu?date=${TOMORROW}`)).json().items[0];
    expect(item.rating).toEqual({ avg: null, count: 0 });
  });

  it('новые оценки добавляют голос: 5, 4, 4 → среднее 4,33 по трём оценкам', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const catalog = catalogFor(test.app.deps);
    catalog.applyRating(dish.id, 5, null);
    catalog.applyRating(dish.id, 4, null);
    catalog.applyRating(dish.id, 4, null);
    expect(catalog.getDishRating(dish.id)).toEqual({ avg: 4.33, count: 3 });
  });

  it('правка оценки заменяет прежнюю и не меняет число голосов: 5 → 2 при одном голосе даёт 2', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const catalog = catalogFor(test.app.deps);
    catalog.applyRating(dish.id, 5, null);
    catalog.applyRating(dish.id, 3, null);
    catalog.applyRating(dish.id, 2, 5);
    // голоса остались 2 и 3: среднее 2,5
    expect(catalog.getDishRating(dish.id)).toEqual({ avg: 2.5, count: 2 });
  });

  it('неверные звёзды и неизвестное блюдо отклоняются, рейтинг не меняется', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const catalog = catalogFor(test.app.deps);
    catalog.applyRating(dish.id, 4, null);
    expect(() => catalog.applyRating(dish.id, 6, null)).toThrow();
    expect(() => catalog.applyRating(dish.id, 0, null)).toThrow();
    expect(() => catalog.applyRating(dish.id, 3.5, null)).toThrow();
    expect(() => catalog.applyRating(dish.id, 3, 9)).toThrow();
    expect(() => catalog.applyRating(9999, 3, null)).toThrow();
    expect(catalog.getDishRating(dish.id)).toEqual({ avg: 4, count: 1 });
  });

  it('рейтинг виден в карточке меню и в карточке блюда', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 3 }]);
    const catalog = catalogFor(test.app.deps);
    catalog.applyRating(dish.id, 5, null);
    catalog.applyRating(dish.id, 4, null);
    const item = (await call(test.app, 'GET', `/menu?date=${TOMORROW}`)).json().items[0];
    expect(item.rating).toEqual({ avg: 4.5, count: 2 });
    const card = (await call(test.app, 'GET', `/dishes/${dish.id}`)).json();
    expect(card.dish.rating).toEqual({ avg: 4.5, count: 2 });
  });
});

describe('остаток порций отключённого блюда', () => {
  it('отключённое блюдо в опубликованном меню даёт 0 порций', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    await setMenu(test, TOMORROW, [{ dishId: dish.id, portionLimit: 3 }]);
    const catalog = catalogFor(test.app.deps);
    expect(catalog.portionsLeft(TOMORROW, dish.id)).toBe(3);
    await call(test.app, 'PATCH', `/admin/dishes/${dish.id}`, test.admin, { active: false });
    expect(catalog.portionsLeft(TOMORROW, dish.id)).toBe(0);
  });
});
