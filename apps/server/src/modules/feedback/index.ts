// Модуль feedback: оценки блюд, жалобы на бокс, решения администратора.
// Другие модули пользуются так:
//   feedbackFor(deps).rateDish(userId, { orderId, dishId, stars, tag })        — оценка блюда из выданного заказа;
//   feedbackFor(deps).pendingRatings(userId)                                   — выданные заказы с неоценёнными блюдами;
//   feedbackFor(deps).createComplaint(userId, input, photo?) · support(userId) — жалоба и раздел «Поддержка»;
//   feedbackFor(deps).adminList(status) · resolveComplaint(adminId, id, input) — очередь и решения.
// При создании сервис подключается к другим модулям:
//   catalog.registerReviewsProvider — отзывы в карточке блюда (звёзды, тег, дата; автора нет);
//   profile.registerExportProvider('feedback') и registerDeletionHook('feedback') — выгрузка и удаление данных.
// Рейтинг считает catalog (applyRating). Фото жалоб лежат в FileStorage под `complaints/` и отдаются
// только маршрутом этого модуля (владельцу жалобы и администратору).
import type { AppDeps } from '../../app.ts';
import { catalogFor } from '../catalog/index.ts';
import { profileFor } from '../profile/index.ts';
import { createComplaints, type Complaints } from './complaints.ts';
import { createRatings, type Ratings } from './ratings.ts';

export type FeedbackApi = Omit<Ratings, 'ordersFor'> &
  Complaints & {
    /** Выданные заказы клиента с блюдами, оценками и признаком «можно пожаловаться». */
    ordersFor(userId: number): ReturnType<Ratings['ordersFor']>;
    /** Выданные заказы клиента с блюдами, которые он ещё не оценил (заказы без таких блюд не попадают). */
    pendingRatings(userId: number): ReturnType<Ratings['ordersFor']>;
  };

const instances = new WeakMap<object, FeedbackApi>();

/** Сервис обратной связи для приложения. Один на набор зависимостей. */
export function feedbackFor(deps: AppDeps): FeedbackApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const ratings = createRatings(deps);
  const complaints = createComplaints(deps);
  const api: FeedbackApi = {
    ...ratings,
    ...complaints,
    ordersFor: (userId) => ratings.ordersFor(userId, complaints.complaintBlocked),
    pendingRatings: (userId) =>
      ratings
        .ordersFor(userId, complaints.complaintBlocked)
        .filter((order) => order.canRate)
        .map((order) => ({ ...order, dishes: order.dishes.filter((d) => d.rating === null) }))
        .filter((order) => order.dishes.length > 0),
  };
  instances.set(deps, api);

  catalogFor(deps).registerReviewsProvider((dishId, limit) => ratings.reviewsOf(dishId, limit));

  const profile = profileFor(deps);
  profile.registerExportProvider('feedback', (userId) => ({
    ratings: ratings.exportRatings(userId),
    complaints: complaints.exportComplaints(userId),
  }));
  // Синхронно и в той же транзакции, что удаление аккаунта. Файлы из хранилища удаляются сразу после
  // фиксации (таймер сработает уже после транзакции); если транзакция откатится, очередь откатится с ней.
  profile.registerDeletionHook('feedback', (userId, tx) => {
    complaints.eraseUser(userId, tx);
    const timer = setTimeout(() => {
      complaints.sweepTrash().catch(() => undefined);
    }, 0);
    timer.unref();
  });
  return api;
}
