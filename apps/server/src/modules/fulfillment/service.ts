// Выдача: загрузка холодильника, получение бокса, закрытие дня и списания.
//
// Загрузка: оператор отмечает «загружено», когда приём заказов на дату закрыт и партии всех нужных блюд
// приготовлены (kitchen.batchesFor); подтверждённые заказы холодильника становятся «загружен».
// Получение: клиент (окно выдачи) или оператор (по коду) переводят заказ в «выдан» и в той же транзакции
// вызывают billing.consume. Закрытие дня: невыданные заказы → «списан» с причиной, кредит остаётся потраченным
// (billing.release не вызывается), лишние боксы без заказа пишутся отдельно.
import {
  type CloseDayBody,
  type CloseDayResult,
  type ClosureDto,
  type DayOverview,
  type ExtraWriteOff,
  type LoadItemDto,
  type MissedTemperature,
  type OperatorFridgeDto,
  type PickupBlockedReason,
  type PickupResult,
  type PickupView,
  type TemperatureEntryDto,
  type TemperatureSlot,
  type WriteOffTotalRow,
} from '@sportpit/shared/schemas/fulfillment';
import type { OrderDto } from '@sportpit/shared/schemas/orders';
import type { Lang } from '@sportpit/shared/i18n';
import { addDaysISO, isDateISO, localParts } from '@sportpit/shared/time';
import type { WriteOffReason } from '@sportpit/shared/types';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import type { AuthUser } from '../auth/index.ts';
import { billingFor } from '../billing/index.ts';
import { kitchenFor } from '../kitchen/index.ts';
import { notify } from '../notifications/index.ts';
import { ordersFor, type OrderActor, type OrderRecord } from '../orders/index.ts';
import { AppError } from '../system/errors.ts';
import { EVENT_KINDS, errorDetail } from '../system/events.ts';
import { createTemperatureService, type TemperatureApi } from './temperature.ts';

/** После этого времени (по Кишинёву) система сама закрывает сегодняшний день. */
export const AUTO_CLOSE_TIME = '23:59';
const MAX_REPORT_DAYS = 366;

export interface FulfillmentApi {
  // ---- оператор ----
  /** Холодильники, которые видит пользователь: оператор — свои, администратор — все действующие. */
  fridgesFor(user: Pick<AuthUser, 'role' | 'fridgeIds'>): OperatorFridgeDto[];
  /** График дня: сколько боксов каких блюд положить, партии, заказы, итоги, закрытие и температура. */
  dayOverview(fridgeId: string, date: string, lang?: Lang): DayOverview;
  /** «Загружено»: подтверждённые заказы → «загружен». Повтор безопасен. */
  markLoaded(
    fridgeId: string,
    date: string,
    actorId: number | null,
    lang?: Lang,
  ): { loaded: true; loadedAt: string; orders: number };
  /** Оператор вводит код клиента. Неверный код — 404 invalid_code; повтор по выданному заказу ничего не меняет. */
  pickupByCode(fridgeId: string, date: string, code: string, actor: OrderActor): PickupResult;
  /** Закрытие дня оператором: остаток, списание невыданных заказов и лишних боксов. Повтор безопасен. */
  closeDay(fridgeId: string, input: CloseDayBody, actor: OrderActor): CloseDayResult;
  /** Автозакрытие: все холодильники и даты, которые пора закрыть (23:59 или день уже прошёл). */
  closeDue(): number;

  // ---- клиент ----
  /** Сегодняшние заказы клиента с состоянием получения. */
  clientOrders(userId: number): PickupView[];
  clientOrder(userId: number, orderId: string): PickupView;
  /** Кнопка «Забрал». Вне окна выдачи и до загрузки — 409; повтор безопасен. */
  pickupByClient(userId: number, orderId: string): { order: PickupView; alreadyPickedUp: boolean };

  // ---- температура ----
  logTemperature(
    fridgeId: string,
    slot: TemperatureSlot,
    celsius: number,
    actorId: number | null,
  ): TemperatureEntryDto;
  temperatureLog: TemperatureApi['list'];
  missedTemperature(
    from?: string,
    to?: string,
  ): { from: string; to: string; items: MissedTemperature[] };

  // ---- отчёты ----
  /** Списания за период по дате выдачи: по заказам (блюдо из заказа) и без заказов (блюдо может быть null). */
  writeOffTotals(from: string, to: string): WriteOffTotalRow[];
}

const hhmm = (at: Date): string => {
  const p = localParts(at);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

export function createFulfillmentService(deps: AppDeps): FulfillmentApi {
  const { db, clock, system } = deps;
  const admin = adminFor(deps);
  const orders = ordersFor(deps);
  const billing = billingFor(deps);
  const kitchen = kitchenFor(deps);
  const temperature = createTemperatureService(deps);

  // ---- общее ----

  function fridgeOrFail(fridgeId: string) {
    const fridge = admin.getFridge(fridgeId);
    if (!fridge) throw new AppError(404, 'fridge_not_found', 'fulfillment.error.fridgeNotFound');
    return fridge;
  }

  const closureRow = (fridgeId: string, date: string) =>
    db.get<{
      closed_at: string;
      source: 'operator' | 'system';
      remaining_boxes: number | null;
    }>(
      'SELECT closed_at, source, remaining_boxes FROM day_closures WHERE fridge_id = ? AND date = ?',
      [fridgeId, date],
    );

  function closureDto(fridgeId: string, date: string): ClosureDto | null {
    const row = closureRow(fridgeId, date);
    if (!row) return null;
    const orderCount = db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM order_write_offs WHERE fridge_id = ? AND date = ?',
      [fridgeId, date],
    )!.n;
    const extra = db.get<{ n: number | null }>(
      'SELECT SUM(qty) AS n FROM write_offs WHERE fridge_id = ? AND date = ?',
      [fridgeId, date],
    )!.n;
    return {
      closedAt: row.closed_at,
      source: row.source,
      remaining: row.remaining_boxes,
      writtenOffOrders: orderCount,
      writtenOffExtra: extra ?? 0,
    };
  }

  const names = (records: OrderRecord[], dishIds: Iterable<number>, lang: Lang): string[] => {
    const wanted = new Set(dishIds);
    const found = new Map<number, string>();
    for (const record of records) {
      for (const item of record.items) {
        if (wanted.has(item.dishId) && !found.has(item.dishId)) {
          found.set(item.dishId, item.name[lang]);
        }
      }
    }
    return [...found.values()];
  };

  function fridgeDto(fridge: NonNullable<ReturnType<typeof admin.getFridge>>): OperatorFridgeDto {
    return {
      id: fridge.id,
      name: fridge.name,
      gymName: fridge.gymName,
      pickupFrom: fridge.pickupFrom,
      pickupTo: fridge.pickupTo,
    };
  }

  // ---- график и загрузка ----

  function dayOverview(fridgeId: string, date: string, lang: Lang = 'ru'): DayOverview {
    const fridge = fridgeOrFail(fridgeId);
    const records = orders.listByFridgeDate(fridgeId, date);
    const batches = new Map(kitchen.batchesFor(fridgeId, date).map((b) => [b.dishId, b]));
    const perDish = new Map<number, LoadItemDto>();
    for (const record of records) {
      for (const item of record.items) {
        const known = perDish.get(item.dishId);
        if (known) {
          known.qty += item.qty;
        } else {
          const batch = batches.get(item.dishId) ?? null;
          perDish.set(item.dishId, {
            dishId: item.dishId,
            name: item.name,
            qty: item.qty,
            batch: batch ? { id: batch.id, code: batch.code, status: batch.status } : null,
            cooked: batch?.status === 'cooked',
          });
        }
      }
    }
    const items = [...perDish.values()].sort((a, b) => a.dishId - b.dishId);
    const load = db.get<{ loaded_at: string }>(
      'SELECT loaded_at FROM fridge_loads WHERE fridge_id = ? AND date = ?',
      [fridgeId, date],
    );
    const sum = (statuses: string[]) =>
      records.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r.boxes, 0);
    return {
      fridge: fridgeDto(fridge),
      date,
      today: clock.localDate(),
      cutoffPassed: clock.now() >= admin.cutoffAt(fridge.id, date),
      loaded: load !== undefined,
      loadedAt: load?.loaded_at ?? null,
      items,
      blockedDishes: load
        ? []
        : items.filter((i) => !i.cooked).map((i) => names(records, [i.dishId], lang)[0]!),
      orders: records.map((r) => ({
        id: r.id,
        status: r.status,
        boxes: r.boxes,
        items: r.items.map((i) => ({ dishId: i.dishId, qty: i.qty, name: i.name })),
      })),
      totals: {
        boxes: records.reduce((n, r) => n + r.boxes, 0),
        pickedUp: sum(['picked_up']),
        waiting: sum(['confirmed', 'loaded']),
        writtenOff: sum(['written_off']),
      },
      closure: closureDto(fridgeId, date),
      temperature: temperature.forDay(fridgeId, date),
    };
  }

  function markLoaded(fridgeId: string, date: string, actorId: number | null, lang: Lang = 'ru') {
    const fridge = fridgeOrFail(fridgeId);
    const today = clock.localDate();
    if (date < today || date > addDaysISO(today, 1)) {
      throw new AppError(409, 'date_out_of_range', 'fulfillment.error.loadDate');
    }
    if (closureRow(fridgeId, date)) {
      throw new AppError(409, 'day_closed', 'fulfillment.error.dayClosed');
    }
    if (clock.now() < admin.cutoffAt(fridge.id, date)) {
      throw new AppError(409, 'cutoff_not_passed', 'fulfillment.error.cutoffNotPassed', {
        params: { time: fridge.cutoffTime },
      });
    }
    return db.tx((tx) => {
      const records = orders.listByFridgeDate(fridgeId, date);
      const waiting = records.filter((r) => r.status === 'confirmed');
      if (waiting.length > 0) {
        const cooked = new Set(
          kitchen
            .batchesFor(fridgeId, date)
            .filter((b) => b.status === 'cooked')
            .map((b) => b.dishId),
        );
        const missing = new Set<number>();
        for (const record of waiting) {
          for (const item of record.items) if (!cooked.has(item.dishId)) missing.add(item.dishId);
        }
        if (missing.size > 0) {
          throw new AppError(409, 'batches_not_cooked', 'fulfillment.error.batchesNotCooked', {
            params: { dishes: names(waiting, missing, lang).join(', ') },
          });
        }
      }
      // Готовых порций партии должно хватать на подтверждённые заказы всех холодильников на дату
      // (партия одна на блюдо и дату): иначе кому-то из клиентов бокса не достанется.
      if (waiting.length > 0) {
        const needed = new Map<number, number>();
        for (const row of orders.confirmedItemsByDate(date)) {
          needed.set(row.dishId, (needed.get(row.dishId) ?? 0) + row.qty);
        }
        const short = new Set<number>();
        const lines: string[] = [];
        for (const batch of kitchen.batchesFor(fridgeId, date)) {
          const need = needed.get(batch.dishId) ?? 0;
          if (batch.status === 'cooked' && batch.totalQty < need && !short.has(batch.dishId)) {
            short.add(batch.dishId);
            lines.push(`${names(waiting, [batch.dishId], lang)[0]!} (${batch.totalQty}/${need})`);
          }
        }
        if (short.size > 0) {
          throw new AppError(409, 'batch_short', 'fulfillment.error.batchShort', {
            params: { dishes: lines.join(', ') },
          });
        }
      }
      const now = clock.now().toISOString();
      for (const record of waiting) {
        orders.transition(record.id, 'loaded', {
          kind: actorId === null ? 'system' : 'operator',
          ...(actorId !== null ? { userId: actorId } : {}),
        });
      }
      tx.run(
        `INSERT INTO fridge_loads (fridge_id, date, loaded_at, loaded_by) VALUES (?, ?, ?, ?)
         ON CONFLICT (fridge_id, date) DO NOTHING`,
        [fridgeId, date, now, actorId],
      );
      const row = tx.get<{ loaded_at: string }>(
        'SELECT loaded_at FROM fridge_loads WHERE fridge_id = ? AND date = ?',
        [fridgeId, date],
      )!;
      const loadedOrders = orders
        .listByFridgeDate(fridgeId, date)
        .filter((r) => r.status === 'loaded' || r.status === 'picked_up').length;
      return { loaded: true as const, loadedAt: row.loaded_at, orders: loadedOrders };
    });
  }

  // ---- получение ----

  /** Состояние получения заказа для клиента. */
  function viewOf(dto: OrderDto): PickupView {
    const fridge = admin.getFridge(dto.fridgeId);
    const now = clock.now();
    let blocked: PickupBlockedReason | null = null;
    if (dto.status === 'cancelled') blocked = 'cancelled';
    else if (dto.status === 'picked_up') blocked = 'picked_up';
    else if (dto.status === 'written_off') blocked = 'written_off';
    else if (dto.date !== clock.localDate(now)) blocked = 'not_today';
    else if (dto.status !== 'loaded') blocked = 'not_loaded';
    else if (hhmm(now) < dto.pickupFrom) blocked = 'before_window';
    else if (hhmm(now) >= dto.pickupTo) blocked = 'after_window';
    const canPickup = blocked === null;
    return {
      orderId: dto.id,
      status: dto.status,
      date: dto.date,
      fridgeId: dto.fridgeId,
      fridgeName: dto.fridgeName,
      gymName: dto.gymName,
      pickupFrom: dto.pickupFrom,
      pickupTo: dto.pickupTo,
      code: dto.code,
      boxes: dto.boxes,
      items: dto.items.map((i) => ({ dishId: i.dishId, qty: i.qty, name: i.name })),
      loaded: dto.status === 'loaded' || dto.status === 'picked_up',
      canPickup,
      blockedReason: blocked,
      accessCode: canPickup ? (fridge?.accessCode ?? null) : null,
    };
  }

  const BLOCKED_ERROR: Record<PickupBlockedReason, { code: string; key: string; status: number }> =
    {
      not_today: { code: 'pickup_not_today', key: 'fulfillment.error.notToday', status: 409 },
      not_loaded: { code: 'not_loaded', key: 'fulfillment.error.notLoaded', status: 409 },
      before_window: { code: 'window_closed', key: 'fulfillment.error.window', status: 409 },
      after_window: { code: 'window_closed', key: 'fulfillment.error.window', status: 409 },
      picked_up: {
        code: 'already_picked_up',
        key: 'fulfillment.error.alreadyPickedUp',
        status: 409,
      },
      written_off: { code: 'order_written_off', key: 'fulfillment.error.writtenOff', status: 409 },
      cancelled: { code: 'order_cancelled', key: 'fulfillment.error.cancelled', status: 409 },
    };

  /** Выдача: переход в «выдан» и billing.consume в одной транзакции, затем уведомление «Как блюдо?». */
  function completePickup(
    record: OrderRecord,
    actor: OrderActor,
  ): { record: OrderRecord; alreadyPickedUp: boolean } {
    if (record.status === 'picked_up') return { record, alreadyPickedUp: true };
    if (record.status === 'confirmed') {
      throw new AppError(409, 'not_loaded', 'fulfillment.error.notLoaded');
    }
    if (record.status === 'written_off') {
      throw new AppError(409, 'order_written_off', 'fulfillment.error.writtenOff');
    }
    if (record.status === 'cancelled') {
      throw new AppError(409, 'order_cancelled', 'fulfillment.error.cancelled');
    }
    const done = db.tx(() => {
      const moved = orders.transition(record.id, 'picked_up', actor);
      billing.consume(record.id);
      return moved;
    });
    try {
      notify(deps, done.userId, 'rate_dish', { orderId: done.id, link: `/rate/${done.id}` });
    } catch (error) {
      // уведомление второстепенно: выдача уже состоялась и откатываться не должна
      system.logEvent(EVENT_KINDS.jobFailed, { job: 'fulfillment-notify', ...errorDetail(error) });
    }
    return { record: done, alreadyPickedUp: false };
  }

  function pickupResult(record: OrderRecord, alreadyPickedUp: boolean): PickupResult {
    return {
      orderId: record.id,
      status: record.status,
      alreadyPickedUp,
      boxes: record.boxes,
      items: record.items.map((i) => ({ dishId: i.dishId, qty: i.qty, name: i.name })),
    };
  }

  function pickupByCode(
    fridgeId: string,
    date: string,
    code: string,
    actor: OrderActor,
  ): PickupResult {
    fridgeOrFail(fridgeId);
    if (date > clock.localDate()) {
      throw new AppError(409, 'pickup_not_today', 'fulfillment.error.notToday');
    }
    const found = orders.findByCode(fridgeId, date, code);
    if (!found) throw new AppError(404, 'invalid_code', 'fulfillment.error.invalidCode');
    const { record, alreadyPickedUp } = completePickup(found, actor);
    return pickupResult(record, alreadyPickedUp);
  }

  function clientOrders(userId: number): PickupView[] {
    const today = clock.localDate();
    const { upcoming, past } = orders.listOrders(userId);
    return [...upcoming, ...past]
      .filter((o) => o.date === today && o.status !== 'cancelled')
      .map(viewOf);
  }

  function clientOrder(userId: number, orderId: string): PickupView {
    return viewOf(orders.getForUser(userId, orderId));
  }

  function pickupByClient(userId: number, orderId: string) {
    const dto = orders.getForUser(userId, orderId);
    const view = viewOf(dto);
    if (view.blockedReason === 'picked_up') return { order: view, alreadyPickedUp: true };
    if (view.blockedReason !== null) {
      const failure = BLOCKED_ERROR[view.blockedReason];
      throw new AppError(failure.status, failure.code, failure.key, {
        params: { from: dto.pickupFrom, to: dto.pickupTo },
      });
    }
    const { alreadyPickedUp } = completePickup(orders.get(orderId)!, { kind: 'client', userId });
    return { order: viewOf(orders.getForUser(userId, orderId)), alreadyPickedUp };
  }

  // ---- закрытие дня ----

  /** Списывает заказ: кредит остаётся потраченным (consume), release не вызывается. */
  function writeOffOrder(
    record: OrderRecord,
    reason: WriteOffReason,
    actor: OrderActor,
    source: 'operator' | 'system',
  ): void {
    orders.transition(record.id, 'written_off', actor);
    try {
      billing.consume(record.id);
    } catch (error) {
      // у заказа не оказалось резерва (повреждённые данные): списание не должно из-за этого застрять
      if (!(error instanceof AppError) || error.code !== 'nothing_reserved') throw error;
    }
    db.run(
      `INSERT INTO order_write_offs (order_id, fridge_id, date, reason, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.id, record.fridgeId, record.date, reason, source, clock.now().toISOString()],
    );
  }

  function closeInside(
    fridgeId: string,
    date: string,
    options: {
      remaining: number | null;
      reason: WriteOffReason;
      orderReasons?: Map<string, WriteOffReason>;
      extras?: ExtraWriteOff[];
    },
    actor: OrderActor,
  ): CloseDayResult {
    const source = actor.kind === 'system' ? 'system' : 'operator';
    return db.tx((tx) => {
      if (closureRow(fridgeId, date)) {
        return { date, fridgeId, alreadyClosed: true, closure: closureDto(fridgeId, date)! };
      }
      const open = orders
        .listByFridgeDate(fridgeId, date)
        .filter((r) => r.status === 'confirmed' || r.status === 'loaded');
      const inFridge = open.filter((r) => r.status === 'loaded').reduce((n, r) => n + r.boxes, 0);

      for (const id of options.orderReasons?.keys() ?? []) {
        if (!open.some((r) => r.id === id)) {
          throw new AppError(400, 'unknown_order', 'fulfillment.error.unknownOrder');
        }
      }
      // лишние боксы: фактический остаток минус те, что должны остаться по невыданным заказам
      const surplus = options.remaining === null ? 0 : Math.max(0, options.remaining - inFridge);
      let extras = options.extras ?? [];
      const extrasTotal = extras.reduce((n, e) => n + e.qty, 0);
      if (extras.length === 0 && surplus > 0) {
        extras = [{ dishId: null, qty: surplus, reason: options.reason }];
      } else if (extrasTotal !== surplus) {
        throw new AppError(400, 'extras_mismatch', 'fulfillment.error.extrasMismatch', {
          params: { surplus },
        });
      }

      for (const record of open) {
        writeOffOrder(
          record,
          options.orderReasons?.get(record.id) ?? options.reason,
          actor,
          source,
        );
      }
      const now = clock.now().toISOString();
      for (const extra of extras) {
        tx.run(
          `INSERT INTO write_offs (fridge_id, date, dish_id, reason, qty, source, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fridgeId,
            date,
            extra.dishId,
            extra.reason,
            extra.qty,
            source,
            actor.userId ?? null,
            now,
          ],
        );
      }
      tx.run(
        `INSERT INTO day_closures (fridge_id, date, closed_at, closed_by, source, remaining_boxes, expected_boxes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fridgeId, date, now, actor.userId ?? null, source, options.remaining, inFridge],
      );
      return { date, fridgeId, alreadyClosed: false, closure: closureDto(fridgeId, date)! };
    });
  }

  function closeDay(fridgeId: string, input: CloseDayBody, actor: OrderActor): CloseDayResult {
    const fridge = fridgeOrFail(fridgeId);
    const now = clock.now();
    const today = clock.localDate(now);
    if (input.date > today) {
      throw new AppError(409, 'date_out_of_range', 'fulfillment.error.closeDate');
    }
    // пока идёт окно выдачи, день закрывать рано: клиенты ещё могут забрать боксы
    if (input.date === today && hhmm(now) < fridge.pickupTo && !closureRow(fridgeId, input.date)) {
      throw new AppError(409, 'window_open', 'fulfillment.error.windowOpen', {
        params: { time: fridge.pickupTo },
      });
    }
    return closeInside(
      fridgeId,
      input.date,
      {
        remaining: input.remaining,
        reason: input.reason,
        orderReasons: new Map((input.orders ?? []).map((o) => [o.orderId, o.reason])),
        extras: input.extras ?? [],
      },
      actor,
    );
  }

  function closeDue(): number {
    const now = clock.now();
    const today = clock.localDate(now);
    const lateEnough = hhmm(now) >= AUTO_CLOSE_TIME;
    const candidates = db.query<{ fridge_id: string; date: string }>(
      `SELECT fridge_id, date FROM orders o
        WHERE status IN ('confirmed', 'loaded') AND date <= ?
          AND NOT EXISTS (SELECT 1 FROM day_closures c WHERE c.fridge_id = o.fridge_id AND c.date = o.date)
       UNION
       SELECT fridge_id, date FROM fridge_loads l
        WHERE date <= ?
          AND NOT EXISTS (SELECT 1 FROM day_closures c WHERE c.fridge_id = l.fridge_id AND c.date = l.date)
       ORDER BY date, fridge_id`,
      [today, today],
    );
    let closed = 0;
    for (const { fridge_id: fridgeId, date } of candidates) {
      if (date === today && !lateEnough) continue;
      try {
        const result = closeInside(
          fridgeId,
          date,
          { remaining: null, reason: 'not_picked_up' },
          { kind: 'system' },
        );
        if (!result.alreadyClosed) closed += 1;
      } catch (error) {
        // один сбойный холодильник не должен останавливать остальных; следующая минута повторит
        system.logEvent(EVENT_KINDS.jobFailed, {
          job: 'fulfillment-close-day',
          fridgeId,
          date,
          ...errorDetail(error),
        });
      }
    }
    return closed;
  }

  // ---- отчёты ----

  function writeOffTotals(from: string, to: string): WriteOffTotalRow[] {
    if (!isDateISO(from) || !isDateISO(to) || from > to || addDaysISO(from, MAX_REPORT_DAYS) < to) {
      throw new AppError(400, 'bad_range', 'fulfillment.error.range');
    }
    const rows = new Map<string, WriteOffTotalRow>();
    const add = (row: WriteOffTotalRow) => {
      const key = `${row.date}|${row.fridgeId}|${row.dishId ?? ''}|${row.reason}`;
      const known = rows.get(key);
      if (known) known.qty += row.qty;
      else rows.set(key, { ...row });
    };
    for (const r of db.query<{
      date: string;
      fridge_id: string;
      dish_id: number;
      reason: WriteOffReason;
      qty: number;
    }>(
      `SELECT w.date, w.fridge_id, i.dish_id, w.reason, SUM(i.qty) AS qty
         FROM order_write_offs w JOIN order_items i ON i.order_id = w.order_id
        WHERE w.date BETWEEN ? AND ?
        GROUP BY w.date, w.fridge_id, i.dish_id, w.reason`,
      [from, to],
    )) {
      add({ date: r.date, fridgeId: r.fridge_id, dishId: r.dish_id, reason: r.reason, qty: r.qty });
    }
    for (const r of db.query<{
      date: string;
      fridge_id: string;
      dish_id: number | null;
      reason: WriteOffReason;
      qty: number;
    }>(
      `SELECT date, fridge_id, dish_id, reason, SUM(qty) AS qty FROM write_offs
        WHERE date BETWEEN ? AND ? GROUP BY date, fridge_id, dish_id, reason`,
      [from, to],
    )) {
      add({ date: r.date, fridgeId: r.fridge_id, dishId: r.dish_id, reason: r.reason, qty: r.qty });
    }
    return [...rows.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.fridgeId.localeCompare(b.fridgeId) ||
        (a.dishId ?? Number.MAX_SAFE_INTEGER) - (b.dishId ?? Number.MAX_SAFE_INTEGER) ||
        a.reason.localeCompare(b.reason),
    );
  }

  return {
    fridgesFor: (user) =>
      admin
        .listFridges()
        .filter((f) => f.active && (user.role === 'admin' || user.fridgeIds.includes(f.id)))
        .map(fridgeDto),
    dayOverview,
    markLoaded,
    pickupByCode,
    closeDay,
    closeDue,
    clientOrders,
    clientOrder,
    pickupByClient,
    logTemperature: temperature.log,
    temperatureLog: temperature.list,
    missedTemperature: temperature.missed,
    writeOffTotals,
  };
}
