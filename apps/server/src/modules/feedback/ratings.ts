// Оценки блюд (R26): одна оценка на блюдо в выданном заказе, правка 24 часа. Рейтинг считает catalog.
import {
  RATING_EDIT_WINDOW_HOURS,
  type FeedbackOrderDto,
  type RateInput,
  type RatingDto,
} from '@sportpit/shared/schemas/feedback';
import type { ReviewDto } from '@sportpit/shared/schemas/catalog';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { catalogFor } from '../catalog/index.ts';
import { ordersFor } from '../orders/index.ts';
import { AppError } from '../system/errors.ts';

interface RatingRow {
  order_id: string;
  dish_id: number;
  stars: number;
  tag: string | null;
  created_at: string;
  updated_at: string;
}

const WINDOW_MS = RATING_EDIT_WINDOW_HOURS * 60 * 60 * 1000;
const LIST_LIMIT = 30;
/** Заказы, по которым можно жаловаться: бокс загружен, выдан или списан (R40: невыданный по вине сервиса). */
export const COMPLAINT_ORDER_STATUSES = ['loaded', 'picked_up', 'written_off'] as const;

export function createRatings(deps: AppDeps) {
  const { db, clock } = deps;
  const orders = ordersFor(deps);
  const catalog = catalogFor(deps);
  const admin = adminFor(deps);

  function toDto(row: RatingRow): RatingDto {
    const editableUntil = new Date(Date.parse(row.created_at) + WINDOW_MS).toISOString();
    return {
      orderId: row.order_id,
      dishId: row.dish_id,
      stars: row.stars,
      tag: row.tag,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      editableUntil,
      canEdit: clock.now().getTime() <= Date.parse(editableUntil),
    };
  }

  const ratingOf = (orderId: string, dishId: number): RatingRow | undefined =>
    db.get<RatingRow>('SELECT * FROM dish_ratings WHERE order_id = ? AND dish_id = ?', [
      orderId,
      dishId,
    ]);

  return {
    /** Оценка блюда из выданного заказа клиента; повтор в течение 24 часов правит прежнюю. */
    rateDish(userId: number, input: RateInput): RatingDto {
      const order = orders.get(input.orderId);
      if (!order || order.userId !== userId) {
        throw new AppError(404, 'order_not_found', 'feedback.error.orderNotFound');
      }
      if (order.status !== 'picked_up') {
        throw new AppError(409, 'order_not_picked_up', 'feedback.error.orderNotPickedUp');
      }
      if (!order.items.some((item) => item.dishId === input.dishId)) {
        throw new AppError(404, 'dish_not_in_order', 'feedback.error.dishNotInOrder');
      }
      const now = clock.now().toISOString();
      return db.tx((tx) => {
        const existing = tx.get<RatingRow>(
          'SELECT * FROM dish_ratings WHERE order_id = ? AND dish_id = ?',
          [input.orderId, input.dishId],
        );
        if (existing) {
          if (clock.now().getTime() > Date.parse(existing.created_at) + WINDOW_MS) {
            throw new AppError(409, 'rating_locked', 'feedback.error.ratingLocked');
          }
          tx.run(
            'UPDATE dish_ratings SET stars = ?, tag = ?, updated_at = ? WHERE order_id = ? AND dish_id = ?',
            [input.stars, input.tag ?? null, now, input.orderId, input.dishId],
          );
          catalog.applyRating(input.dishId, input.stars, existing.stars);
        } else {
          tx.run(
            `INSERT INTO dish_ratings (order_id, dish_id, user_id, stars, tag, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [input.orderId, input.dishId, userId, input.stars, input.tag ?? null, now, now],
          );
          catalog.applyRating(input.dishId, input.stars, null);
        }
        return toDto(
          tx.get<RatingRow>('SELECT * FROM dish_ratings WHERE order_id = ? AND dish_id = ?', [
            input.orderId,
            input.dishId,
          ])!,
        );
      });
    },

    /** Отзывы о блюде для карточки: звёзды, тег, дата. Автора в выборке нет вовсе. */
    reviewsOf(dishId: number, limit: number): ReviewDto[] {
      return db
        .query<{ stars: number; tag: string | null; created_at: string }>(
          'SELECT stars, tag, created_at FROM dish_ratings WHERE dish_id = ? ORDER BY id DESC LIMIT ?',
          [dishId, limit],
        )
        .map((row) => ({ stars: row.stars, tag: row.tag, createdAt: row.created_at }));
    },

    /** Заказы клиента, по которым можно оценить блюда или пожаловаться, новые первыми. */
    ordersFor(userId: number, complaintBlocked: (orderId: string) => boolean): FeedbackOrderDto[] {
      return orders
        .listForExport(userId)
        .filter((order) => (COMPLAINT_ORDER_STATUSES as readonly string[]).includes(order.status))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, LIST_LIMIT)
        .map((order) => ({
          orderId: order.id,
          date: order.date,
          status: order.status,
          canRate: order.status === 'picked_up',
          fridgeName: order.fridge.name,
          gymName: admin.getFridge(order.fridge.id)?.gymName ?? null,
          dishes: order.items.map((item) => {
            const row = ratingOf(order.id, item.dishId);
            return {
              dishId: item.dishId,
              name: item.name,
              qty: item.qty,
              rating: row ? toDto(row) : null,
            };
          }),
          canComplain: !complaintBlocked(order.id),
        }));
    },

    /** Все оценки клиента для выгрузки данных. */
    exportRatings(userId: number) {
      return db
        .query<RatingRow>('SELECT * FROM dish_ratings WHERE user_id = ? ORDER BY id', [userId])
        .map((row) => ({
          orderId: row.order_id,
          dishId: row.dish_id,
          stars: row.stars,
          tag: row.tag,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
    },
  };
}

export type Ratings = ReturnType<typeof createRatings>;
