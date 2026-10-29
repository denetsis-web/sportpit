// Модуль catalog: блюда, меню на дни, остаток порций, рейтинг блюда. Другие модули пользуются так:
//   catalogFor(deps).listMenu(date, filters) · getDish(id, date?) · portionsLeft(date, dishId)
//   catalogFor(deps).registerReservedProvider((date, dishId) => занято)   — заказы (по умолчанию 0)
//   catalogFor(deps).getDishRating(dishId) · applyRating(dishId, newStars, previousStars | null)  — оценки
//   catalogFor(deps).registerReviewsProvider((dishId, limit) => отзывы) · registerCookedAtProvider(...) — кухня
import { randomBytes } from 'node:crypto';
import {
  matchesFilters,
  PHOTO_MAX_BYTES,
  type AdminDishDto,
  type AdminMenuDayDto,
  type DishCardDto,
  type DishInput,
  type DishPatch,
  type MenuDaySummary,
  type MenuDto,
  type MenuEntry,
  type MenuFilters,
  type MenuItemDto,
  type Rating,
  type ReviewDto,
} from '@sportpit/shared/schemas/catalog';
import { addDaysISO } from '@sportpit/shared/time';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { AppError, errors } from '../system/errors.ts';
import {
  createDish,
  getDishRow,
  listDishRows,
  setDishPhotoKey,
  toAdminDish,
  updateDish,
  type DishRow,
} from './dishes.ts';
import {
  adminDay,
  copyDay,
  getDay,
  listDays,
  listItems,
  publishDay,
  saveDay,
  type ReservedProvider,
} from './menu.ts';
import { sniffPhoto } from './photos.ts';

export type CatalogDeps = Pick<AppDeps, 'db' | 'clock' | 'storage'>;
export type { ReservedProvider };
/** Время приготовления партии для блюда на дату (момент UTC) или `null`, если ещё не отмечено. */
export type CookedAtProvider = (date: string, dishId: number) => string | null;
/** Отзывы о блюде, новые первыми. Лишние поля (автор, телефон) наружу не попадают. */
export type ReviewsProvider = (dishId: number, limit: number) => ReviewDto[];

const REVIEWS_LIMIT = 20;

export interface CatalogApi {
  listMenu(date: string | undefined, filters?: MenuFilters): MenuDto;
  /** Карточка блюда; отключённое и неизвестное блюдо — `undefined`. */
  getDish(id: number, date?: string): DishCardDto | undefined;
  /** Сколько порций можно заказать: лимит дня минус занятое; нет в опубликованном меню — 0. */
  portionsLeft(date: string, dishId: number): number;
  registerReservedProvider(fn: ReservedProvider): void;
  registerCookedAtProvider(fn: CookedAtProvider): void;
  registerReviewsProvider(fn: ReviewsProvider): void;

  getDishRating(dishId: number): Rating;
  /** Учитывает оценку: первая (`previousStars` = null) добавляет голос, правка заменяет прежнюю. */
  applyRating(dishId: number, newStars: number, previousStars: number | null): void;

  listDishes(): AdminDishDto[];
  /** Создаёт блюдо (без `id`) или правит существующее (с `id`); пишет в журнал. */
  upsertDish(input: DishInput, actorId: number | null): AdminDishDto;
  upsertDish(input: DishPatch, actorId: number | null, id: number): AdminDishDto;
  setDishPhoto(id: number, data: Uint8Array, actorId: number | null): Promise<AdminDishDto>;
  removeDishPhoto(id: number, actorId: number | null): Promise<AdminDishDto>;

  adminMenuDay(date: string): AdminMenuDayDto;
  listMenuDays(from: string, to: string): MenuDaySummary[];
  saveMenu(date: string, items: MenuEntry[], actorId: number | null): AdminMenuDayDto;
  publishMenu(date: string, actorId: number | null): AdminMenuDayDto;
  copyMenu(date: string, fromDate: string, actorId: number | null): AdminMenuDayDto;
}

const instances = new WeakMap<object, CatalogApi>();

export function catalogFor(deps: CatalogDeps): CatalogApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock, storage } = deps;
  const admin = adminFor(deps);
  let reserved: ReservedProvider = () => 0;
  let cookedAt: CookedAtProvider = () => null;
  let reviews: ReviewsProvider = () => [];

  const photoUrl = (key: string) => storage.urlFor(key);
  const today = () => clock.localDate();
  const takenOf: ReservedProvider = (date, dishId) => Math.max(0, reserved(date, dishId));

  function getDishRating(dishId: number): Rating {
    const row = db.get<{ s: number; n: number }>(
      'SELECT rating_sum AS s, rating_count AS n FROM dish_rating_stats WHERE dish_id = ?',
      [dishId],
    );
    if (!row || row.n === 0) return { avg: null, count: 0 };
    return { avg: Math.round((row.s / row.n) * 100) / 100, count: row.n };
  }

  function portionsLeft(date: string, dishId: number): number {
    const row = db.get<{ portion_limit: number }>(
      `SELECT i.portion_limit FROM menu_items i
         JOIN menu_days d ON d.date = i.date AND d.published = 1
         JOIN dishes x ON x.id = i.dish_id AND x.active = 1
       WHERE i.date = ? AND i.dish_id = ?`,
      [date, dishId],
    );
    if (!row) return 0;
    return Math.max(0, row.portion_limit - takenOf(date, dishId));
  }

  function menuItem(row: DishRow, date: string | undefined, left: number): MenuItemDto {
    const { active: _active, ...dish } = toAdminDish(row, photoUrl);
    return {
      ...dish,
      rating: getDishRating(row.id),
      portionsLeft: left,
      soldOut: left === 0,
      cookedAt: date ? cookedAt(date, row.id) : null,
    };
  }

  /** Ближайший опубликованный день после `date`; прошедшие дни не предлагаются. */
  function nextPublishedAfter(date: string): string | null {
    const row = db.get<{ date: string }>(
      'SELECT date FROM menu_days WHERE published = 1 AND date > ? AND date >= ? ORDER BY date LIMIT 1',
      [date, today()],
    );
    return row?.date ?? null;
  }

  const api: CatalogApi = {
    listMenu(date, filters = {}) {
      const day = date ?? addDaysISO(today(), 1);
      const published = getDay(db, day)?.published === 1;
      const items: MenuItemDto[] = [];
      if (published) {
        for (const entry of listItems(db, day)) {
          const row = getDishRow(db, entry.dish_id);
          if (!row || row.active !== 1) continue;
          const left = Math.max(0, entry.portion_limit - takenOf(day, row.id));
          const item = menuItem(row, day, left);
          if (matchesFilters(item, filters)) items.push(item);
        }
      }
      return {
        date: day,
        today: today(),
        published,
        nextDate: nextPublishedAfter(day),
        items,
        toleranceNote: admin.getSetting('toleranceNote'),
      };
    },

    getDish(id, date) {
      const row = getDishRow(db, id);
      if (!row || row.active !== 1) return undefined;
      const onMenu =
        date !== undefined &&
        db.get(
          `SELECT 1 AS x FROM menu_items i JOIN menu_days d ON d.date = i.date AND d.published = 1
           WHERE i.date = ? AND i.dish_id = ?`,
          [date, id],
        ) !== undefined;
      const left = date ? portionsLeft(date, id) : 0;
      // из отзывов наружу идут только звёзды, тег и дата: имени и телефона автора здесь нет
      const safeReviews: ReviewDto[] = reviews(id, REVIEWS_LIMIT)
        .slice(0, REVIEWS_LIMIT)
        .map(({ stars, tag, createdAt }) => ({ stars, tag: tag ?? null, createdAt }));
      return {
        dish: { ...menuItem(row, date, left), onMenu },
        reviews: safeReviews,
        today: today(),
        toleranceNote: admin.getSetting('toleranceNote'),
      };
    },

    portionsLeft,
    registerReservedProvider: (fn) => {
      reserved = fn;
    },
    registerCookedAtProvider: (fn) => {
      cookedAt = fn;
    },
    registerReviewsProvider: (fn) => {
      reviews = fn;
    },

    getDishRating,
    applyRating(dishId, newStars, previousStars) {
      const isStar = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
      if (!isStar(newStars) || (previousStars !== null && !isStar(previousStars))) {
        throw new RangeError('Оценка — целое число от 1 до 5');
      }
      db.tx((tx) => {
        if (!getDishRow(tx, dishId)) throw new RangeError(`Нет блюда ${dishId}`);
        tx.run(
          `INSERT INTO dish_rating_stats (dish_id, rating_sum, rating_count) VALUES (?, 0, 0)
           ON CONFLICT (dish_id) DO NOTHING`,
          [dishId],
        );
        if (previousStars === null) {
          tx.run(
            `UPDATE dish_rating_stats SET rating_sum = rating_sum + ?, rating_count = rating_count + 1
             WHERE dish_id = ?`,
            [newStars, dishId],
          );
        } else {
          tx.run('UPDATE dish_rating_stats SET rating_sum = rating_sum + ? WHERE dish_id = ?', [
            newStars - previousStars,
            dishId,
          ]);
        }
      });
    },

    listDishes: () => listDishRows(db).map((row) => toAdminDish(row, photoUrl)),
    upsertDish(input: DishInput | DishPatch, actorId: number | null, id?: number) {
      const row =
        id === undefined
          ? createDish(db, clock, input as DishInput, actorId)
          : updateDish(db, clock, id, input, actorId);
      return toAdminDish(row, photoUrl);
    },

    async setDishPhoto(id, data, actorId) {
      if (!getDishRow(db, id)) throw errors.notFound('catalog.error.dishNotFound');
      if (data.byteLength > PHOTO_MAX_BYTES) {
        throw new AppError(413, 'photo_too_large', 'catalog.error.photoTooLarge');
      }
      const kind = sniffPhoto(data);
      if (!kind) throw new AppError(415, 'photo_type', 'catalog.error.photoType');
      const key = `dishes/${id}-${randomBytes(6).toString('hex')}.${kind.ext}`;
      await storage.put(key, data);
      let previous: string | null;
      try {
        previous = setDishPhotoKey(db, clock, id, key, actorId);
      } catch (error) {
        await storage.delete(key);
        throw error;
      }
      if (previous) await storage.delete(previous);
      return toAdminDish(getDishRow(db, id)!, photoUrl);
    },

    async removeDishPhoto(id, actorId) {
      const previous = setDishPhotoKey(db, clock, id, null, actorId);
      if (previous) await storage.delete(previous);
      return toAdminDish(getDishRow(db, id)!, photoUrl);
    },

    adminMenuDay: (date) => adminDay(db, date, takenOf),
    listMenuDays: (from, to) => listDays(db, from, to),
    saveMenu: (date, items, actorId) => saveDay(db, clock, date, items, takenOf, actorId),
    publishMenu: (date, actorId) => publishDay(db, clock, date, takenOf, actorId),
    copyMenu: (date, fromDate, actorId) => copyDay(db, clock, date, fromDate, takenOf, actorId),
  };
  instances.set(deps, api);
  return api;
}
