// Правила заказов: подтверждение, отмена, перенос, переходы статусов, доступность дня.
//
// Подтверждение атомарно (одна транзакция db.tx): срок и дата → пауза → блюда в меню → вместимость
// холодильника → остаток порций → лимит боксов в день → резерв кредитов (billing.reserve). Любой отказ
// откатывает всё, поэтому заказ либо создан целиком вместе с резервом, либо нет.
// Деньги и кредиты — только через публичные функции billing; тексты отказов — ключи orders.error.*.
import { randomUUID } from 'node:crypto';
import type { Lang } from '@sportpit/shared/i18n';
import {
  canTransition,
  type Availability,
  type ClosedReason,
  type ConfirmOrderInput,
  type OrderDto,
  type OrdersList,
  type OrderStatus,
  type PauseCreate,
  type PauseDto,
} from '@sportpit/shared/schemas/orders';
import type { FridgeDto } from '@sportpit/shared/schemas/admin';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { billingFor } from '../billing/index.ts';
import { isPausedOn, listPauses, pauseLot } from '../billing/pause.ts';
import { catalogFor } from '../catalog/index.ts';
import { AppError } from '../system/errors.ts';
import {
  allocateCode,
  boxesOnDate,
  countUserOrders,
  itemTotalsByDate,
  loadOrder,
  loadOrders,
  orderIdByKey,
  reservedPortions,
  type ItemTotal,
  type OrderItemRecord,
  type OrderRecord,
} from './store.ts';

export type { ItemTotal, OrderItemRecord, OrderRecord };

/** Кто переводит заказ в новый статус. */
export interface OrderActor {
  kind: 'client' | 'operator' | 'kitchen' | 'admin' | 'system';
  userId?: number;
}

export interface OrdersApi {
  // ---- клиент ----
  /** Подтверждает заказ и резервирует кредиты. Повтор с тем же ключом возвращает прежний заказ (`created: false`). */
  confirmOrder(
    userId: number,
    input: ConfirmOrderInput,
    lang?: Lang,
  ): { order: OrderDto; created: boolean; firstOrder: boolean };
  /** Отмена до срока: статус «отменён», резерв кредитов возвращён. */
  cancelOrder(userId: number, orderId: string): OrderDto;
  /** Перенос = отмена прежнего заказа и новый заказ в одной транзакции. */
  moveOrder(
    userId: number,
    orderId: string,
    input: ConfirmOrderInput,
    lang?: Lang,
  ): { order: OrderDto; cancelledId: string; created: boolean };
  listOrders(userId: number): OrdersList;
  /** Заказ клиента; чужой и неизвестный — 404. */
  getForUser(userId: number, orderId: string): OrderDto;
  /** Срок, свободные места и лимит клиента на день в холодильнике. */
  availability(userId: number, fridgeId: string, date: string): Availability;
  /** Сколько боксов ещё можно принять в холодильник на день. */
  capacityLeft(fridgeId: string, date: string): number;

  // ---- контракты для кухни, выдачи и отчётов (задачи 07–10) ----
  get(orderId: string): OrderRecord | undefined;
  /** confirmed→loaded→picked_up, confirmed|loaded→written_off, confirmed→cancelled; прочее — 409. */
  transition(orderId: string, to: OrderStatus, actor: OrderActor): OrderRecord;
  /** Заказы холодильника на день (без отменённых) с позициями и кодами. */
  listByFridgeDate(fridgeId: string, date: string): OrderRecord[];
  /** Порции блюд по холодильникам в подтверждённых и загруженных заказах дня. */
  confirmedItemsByDate(date: string): ItemTotal[];
  /** Действующий заказ по коду получения. */
  findByCode(fridgeId: string, date: string, code: string): OrderRecord | undefined;

  /** Все заказы клиента для выгрузки его данных (R29.1): дата, холодильник, блюда, статус. */
  listForExport(userId: number): ExportedOrder[];

  // ---- пауза пакета ----
  pauseLot(userId: number, input: PauseCreate): PauseDto;
  listPauses(userId: number): PauseDto[];
}

export interface ExportedOrder {
  id: string;
  date: string;
  fridge: { id: string; name: string };
  status: OrderStatus;
  boxes: number;
  createdAt: string;
  items: OrderItemRecord[];
}

const DEFAULT_CUTOFF = '18:00';

export function createOrdersService(deps: AppDeps): OrdersApi {
  const { db, clock } = deps;
  const admin = adminFor(deps);
  const catalog = catalogFor(deps);
  const billing = billingFor(deps);

  // ---- холодильник и срок ----

  function openFridge(fridgeId: string): FridgeDto {
    const fridge = admin.getFridge(fridgeId);
    // холодильник должен быть активным и в активном зале (клиент видит его в списке)
    if (!fridge || !fridge.active || !admin.getPublicFridge(fridgeId)) {
      throw new AppError(404, 'fridge_unavailable', 'orders.error.fridgeUnavailable');
    }
    return fridge;
  }

  const cutoffTimeOf = (fridgeId: string): string =>
    admin.getFridge(fridgeId)?.cutoffTime ?? DEFAULT_CUTOFF;

  /** Момент, до которого принимаются заказы на день выдачи и можно менять уже принятые. */
  const cutoffAt = (fridgeId: string, date: string): Date =>
    clock.cutoffFor(date, cutoffTimeOf(fridgeId));

  const closedReason = (userId: number, fridgeId: string, date: string): ClosedReason | null => {
    if (date <= clock.localDate()) return 'date';
    if (clock.now() >= cutoffAt(fridgeId, date)) return 'cutoff';
    if (isPausedOn(db, userId, date)) return 'paused';
    return null;
  };

  // ---- представление ----

  function toDto(record: OrderRecord): OrderDto {
    const fridge = admin.getFridge(record.fridgeId);
    const cutoff = cutoffAt(record.fridgeId, record.date);
    return {
      id: record.id,
      status: record.status,
      date: record.date,
      fridgeId: record.fridgeId,
      fridgeName: fridge?.name ?? record.fridgeId,
      gymName: fridge?.gymName ?? '',
      code: record.status === 'cancelled' ? null : record.code,
      boxes: record.boxes,
      items: record.items,
      createdAt: record.createdAt,
      cutoffAt: cutoff.toISOString(),
      canChange: record.status === 'confirmed' && clock.now() < cutoff,
      pickupFrom: fridge?.pickupFrom ?? '',
      pickupTo: fridge?.pickupTo ?? '',
    };
  }

  function ownOrder(userId: number, orderId: string): OrderRecord {
    const record = loadOrder(db, orderId);
    if (!record || record.userId !== userId) {
      throw new AppError(404, 'order_not_found', 'orders.error.orderNotFound');
    }
    return record;
  }

  // ---- переходы статусов ----

  function transitionInside(orderId: string, to: OrderStatus, actor: OrderActor): OrderRecord {
    return db.tx((tx) => {
      const record = loadOrder(tx, orderId);
      if (!record) throw new AppError(404, 'order_not_found', 'orders.error.orderNotFound');
      if (!canTransition(record.status, to)) {
        throw new AppError(409, 'invalid_transition', 'orders.error.transition');
      }
      const now = clock.now().toISOString();
      tx.run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [to, now, orderId]);
      tx.run(
        `INSERT INTO order_transitions (order_id, from_status, to_status, actor_kind, actor_user_id, at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, record.status, to, actor.kind, actor.userId ?? null, now],
      );
      // отмена возвращает резерв кредитов; выдачу и списание (consume) делает модуль выдачи
      if (to === 'cancelled') billing.release(orderId);
      return loadOrder(tx, orderId)!;
    });
  }

  // ---- подтверждение ----

  function confirmInside(
    userId: number,
    input: ConfirmOrderInput,
    lang: Lang,
    key: 'cutoffPassed' | 'cancelCutoff',
  ): { record: OrderRecord; created: boolean } {
    const existingId = orderIdByKey(db, userId, input.idempotencyKey);
    if (existingId) return { record: loadOrder(db, existingId)!, created: false };

    const fridge = openFridge(input.fridgeId);
    if (input.date <= clock.localDate()) {
      throw new AppError(409, 'date_not_future', 'orders.error.dateNotFuture');
    }
    if (clock.now() >= clock.cutoffFor(input.date, fridge.cutoffTime)) {
      throw new AppError(409, 'cutoff_passed', `orders.error.${key}`, {
        params: { time: fridge.cutoffTime },
      });
    }
    if (isPausedOn(db, userId, input.date)) {
      throw new AppError(409, 'paused_day', 'orders.error.pausedDay');
    }

    // одно блюдо несколькими строками — одна позиция
    const wanted = new Map<number, number>();
    for (const item of input.items)
      wanted.set(item.dishId, (wanted.get(item.dishId) ?? 0) + item.qty);
    const total = [...wanted.values()].reduce((sum, qty) => sum + qty, 0);

    const dishes = [...wanted].map(([dishId, qty]) => {
      const card = catalog.getDish(dishId, input.date);
      if (!card || !card.dish.onMenu) {
        throw new AppError(409, 'dish_unavailable', 'orders.error.dishUnavailable', {
          params: { dish: card ? card.dish.name[lang] : `#${dishId}`, dishId },
        });
      }
      return { dish: card.dish, qty };
    });

    const used = boxesOnDate(db, input.date, { fridgeId: fridge.id });
    if (used + total > fridge.capacityBoxes) {
      throw new AppError(409, 'fridge_full', 'orders.error.noSeats', {
        params: { left: Math.max(0, fridge.capacityBoxes - used) },
      });
    }

    for (const { dish, qty } of dishes) {
      if (catalog.portionsLeft(input.date, dish.id) < qty) {
        throw new AppError(409, 'dish_sold_out', 'orders.error.dishSoldOut', {
          params: { dish: dish.name[lang], dishId: dish.id },
        });
      }
    }

    const max = admin.getSetting('maxBoxesPerDay');
    const mine = boxesOnDate(db, input.date, { userId });
    if (mine + total > max) {
      throw new AppError(409, 'box_limit', 'orders.error.boxLimit', {
        params: { max, used: mine },
      });
    }

    const id = randomUUID();
    const now = clock.now().toISOString();
    const code = allocateCode(db, fridge.id, input.date);
    db.run(
      `INSERT INTO orders
         (id, user_id, fridge_id, date, status, code, boxes, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)`,
      [id, userId, fridge.id, input.date, code, total, input.idempotencyKey, now, now],
    );
    dishes.forEach(({ dish, qty }, position) => {
      db.run(
        `INSERT INTO order_items
           (order_id, dish_id, qty, name_ru, name_ro, calories, protein_g, fat_g, carbs_g, fiber_g, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          dish.id,
          qty,
          dish.name.ru,
          dish.name.ro,
          dish.calories,
          dish.proteinG,
          dish.fatG,
          dish.carbsG,
          dish.fiberG,
          position,
        ],
      );
    });
    db.run(
      `INSERT INTO order_transitions (order_id, from_status, to_status, actor_kind, actor_user_id, at)
       VALUES (?, NULL, 'confirmed', 'client', ?, ?)`,
      [id, userId, now],
    );
    // нехватка кредитов даёт 409 insufficient_credits и откатывает весь заказ
    billing.reserve(userId, total, id);
    return { record: loadOrder(db, id)!, created: true };
  }

  const assertChangeable = (record: OrderRecord): void => {
    if (record.status !== 'confirmed') {
      throw new AppError(409, 'order_not_changeable', 'orders.error.notChangeable');
    }
    const cutoff = cutoffAt(record.fridgeId, record.date);
    if (clock.now() >= cutoff) {
      throw new AppError(409, 'cutoff_passed', 'orders.error.cancelCutoff', {
        params: { time: cutoffTimeOf(record.fridgeId) },
      });
    }
  };

  const api: OrdersApi = {
    confirmOrder(userId, input, lang = 'ru') {
      return db.tx(() => {
        const { record, created } = confirmInside(userId, input, lang, 'cutoffPassed');
        return {
          order: toDto(record),
          created,
          firstOrder: created && countUserOrders(db, userId) === 1,
        };
      });
    },

    cancelOrder(userId, orderId) {
      return db.tx(() => {
        const record = ownOrder(userId, orderId);
        if (record.status === 'cancelled') return toDto(record);
        assertChangeable(record);
        return toDto(transitionInside(orderId, 'cancelled', { kind: 'client', userId }));
      });
    },

    moveOrder(userId, orderId, input, lang = 'ru') {
      return db.tx(() => {
        const existingId = orderIdByKey(db, userId, input.idempotencyKey);
        if (existingId) {
          return { order: toDto(loadOrder(db, existingId)!), cancelledId: orderId, created: false };
        }
        const old = ownOrder(userId, orderId);
        assertChangeable(old);
        transitionInside(orderId, 'cancelled', { kind: 'client', userId });
        const { record, created } = confirmInside(userId, input, lang, 'cutoffPassed');
        return { order: toDto(record), cancelledId: orderId, created };
      });
    },

    listOrders(userId) {
      const today = clock.localDate();
      const all = loadOrders(
        db,
        'user_id = ?',
        [userId],
        'ORDER BY date DESC, created_at DESC, id',
      );
      const upcoming: OrderDto[] = [];
      const past: OrderDto[] = [];
      for (const record of all) {
        const active = record.status === 'confirmed' || record.status === 'loaded';
        (active && record.date >= today ? upcoming : past).push(toDto(record));
      }
      return { upcoming: upcoming.reverse(), past: past.slice(0, 100) };
    },

    getForUser: (userId, orderId) => toDto(ownOrder(userId, orderId)),

    availability(userId, fridgeId, date) {
      const fridge = openFridge(fridgeId);
      return {
        fridgeId: fridge.id,
        date,
        capacityBoxes: fridge.capacityBoxes,
        boxesLeft: Math.max(0, fridge.capacityBoxes - boxesOnDate(db, date, { fridgeId })),
        cutoffTime: fridge.cutoffTime,
        cutoffAt: clock.cutoffFor(date, fridge.cutoffTime).toISOString(),
        closedReason: closedReason(userId, fridge.id, date),
        maxBoxesPerDay: admin.getSetting('maxBoxesPerDay'),
        userBoxes: boxesOnDate(db, date, { userId }),
      };
    },

    capacityLeft(fridgeId, date) {
      const fridge = admin.getFridge(fridgeId);
      if (!fridge) return 0;
      return Math.max(0, fridge.capacityBoxes - boxesOnDate(db, date, { fridgeId }));
    },

    get: (orderId) => loadOrder(db, orderId),
    transition: transitionInside,
    listByFridgeDate: (fridgeId, date) =>
      loadOrders(db, `fridge_id = ? AND date = ? AND status <> 'cancelled'`, [fridgeId, date]),
    confirmedItemsByDate: (date) => itemTotalsByDate(db, date),
    findByCode: (fridgeId, date, code) =>
      loadOrders(db, `fridge_id = ? AND date = ? AND code = ? AND status <> 'cancelled'`, [
        fridgeId,
        date,
        code,
      ])[0],

    listForExport: (userId) =>
      loadOrders(db, 'user_id = ?', [userId]).map((o) => ({
        id: o.id,
        date: o.date,
        fridge: { id: o.fridgeId, name: admin.getFridge(o.fridgeId)?.name ?? o.fridgeId },
        status: o.status,
        boxes: o.boxes,
        createdAt: o.createdAt,
        items: o.items,
      })),

    pauseLot: (userId, input) => pauseLot({ db, clock }, userId, input),
    listPauses: (userId) => listPauses(db, userId),
  };

  // Занятые порции видит меню: catalog спрашивает у заказов, сколько порций блюда на день уже взято.
  catalog.registerReservedProvider((date, dishId) => reservedPortions(db, date, dishId));
  return api;
}
