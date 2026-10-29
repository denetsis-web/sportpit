// Журнал кредитов и лоты. Здесь живут все записи, которые меняют баланс.
//
// Правила (R22, R41, R42, R48):
//   — баланс не хранится: это сумма credit_ledger.delta пользователя (после обработки сгоревших лотов);
//   — журнал только добавляется (триггеры в миграции), исправление — новая запись с причиной;
//   — остаток лота — тоже сумма журнала по lot_id; в минус он уйти не может (триггер lot_overdrawn);
//   — резерв забирает кредиты у лотов, ближайших к сгоранию; возврат резерва возвращает в те же лоты;
//   — сгоревший лот не резервируется: сгорание обрабатывается лениво при каждом чтении баланса
//     и ночной задачей, обе дороги идемпотентны.
// Все функции синхронные и вызываются внутри db.tx: вложенность допускается (внешний заказ + резерв).
import { CARRYOVER_MAX, CARRYOVER_WINDOW_DAYS } from '@sportpit/shared/schemas/billing';
import type { LedgerReason } from '@sportpit/shared/types';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;

export type LotSource = 'purchase' | 'promo' | 'carryover' | 'complaint';

export interface LotRow {
  id: number;
  user_id: number;
  purchase_id: number | null;
  source: LotSource;
  origin_lot_id: number | null;
  credits: number;
  unit_price_bani: number;
  created_at: string;
  expires_at: string;
  expired_at: string | null;
  notified_at: string | null;
}

export type LotWithRemaining = LotRow & { remaining: number };

export interface Ctx {
  db: Db;
  clock: Clock;
}

export const addDaysIso = (at: Date, days: number): string =>
  new Date(at.getTime() + days * DAY_MS).toISOString();

export interface NewEntry {
  userId: number;
  lotId: number | null;
  delta: number;
  reason: LedgerReason;
  orderId?: string;
  purchaseId?: number;
  complaintId?: string;
  refundId?: number;
  memo?: string;
  idemKey?: string;
}

/**
 * Добавляет запись журнала. Повтор с тем же idemKey ничего не пишет и возвращает null:
 * так защищены покупка, сгорание лота, возврат и другие разовые операции.
 */
export function appendEntry({ db, clock }: Ctx, entry: NewEntry): number | null {
  const result = db.run(
    `INSERT INTO credit_ledger
       (user_id, lot_id, delta, reason, order_id, purchase_id, complaint_id, refund_id, memo, idem_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (idem_key) DO NOTHING`,
    [
      entry.userId,
      entry.lotId,
      entry.delta,
      entry.reason,
      entry.orderId ?? null,
      entry.purchaseId ?? null,
      entry.complaintId ?? null,
      entry.refundId ?? null,
      entry.memo ?? null,
      entry.idemKey ?? null,
      clock.now().toISOString(),
    ],
  );
  return result.changes === 0 ? null : Number(result.lastInsertRowid);
}

export interface NewLot {
  userId: number;
  source: LotSource;
  credits: number;
  unitPriceBani: number;
  expiresAt: string;
  purchaseId?: number;
  originLotId?: number;
}

export function insertLot({ db, clock }: Ctx, lot: NewLot): number {
  const { lastInsertRowid } = db.run(
    `INSERT INTO credit_lots
       (user_id, purchase_id, source, origin_lot_id, credits, unit_price_bani, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lot.userId,
      lot.purchaseId ?? null,
      lot.source,
      lot.originLotId ?? null,
      lot.credits,
      lot.unitPriceBani,
      clock.now().toISOString(),
      lot.expiresAt,
    ],
  );
  return Number(lastInsertRowid);
}

export function getLot(db: Db, lotId: number): LotRow | undefined {
  return db.get<LotRow>('SELECT * FROM credit_lots WHERE id = ?', [lotId]);
}

/** Остаток лота = сумма журнала по лоту. */
export function lotRemaining(db: Db, lotId: number): number {
  return db.get<{ n: number }>(
    'SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE lot_id = ?',
    [lotId],
  )!.n;
}

/** Сумма журнала пользователя без обработки сгорания. Для сверок и тестов. */
export function ledgerSum(db: Db, userId: number): number {
  return db.get<{ n: number }>(
    'SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = ?',
    [userId],
  )!.n;
}

/** Лоты с остатком, ближайшие к сгоранию первыми. */
export function lotsWithRemaining(
  db: Db,
  userId: number,
  options: { notExpiredAt?: string } = {},
): LotWithRemaining[] {
  const params: Array<string | number> = [userId];
  let extra = '';
  if (options.notExpiredAt) {
    extra = ' AND l.expired_at IS NULL AND l.expires_at > ?';
    params.push(options.notExpiredAt);
  }
  return db.query<LotWithRemaining>(
    `SELECT l.*, COALESCE(SUM(e.delta), 0) AS remaining
       FROM credit_lots l
       LEFT JOIN credit_ledger e ON e.lot_id = l.id
      WHERE l.user_id = ?${extra}
      GROUP BY l.id
     HAVING remaining > 0
      ORDER BY l.expires_at, l.id`,
    params,
  );
}

/**
 * Сжигает кредиты лотов, срок которых вышел, и помечает лот обработанным. Идемпотентно:
 * повторный вызов ничего не пишет. Без userId — для всех пользователей (ночная задача).
 * Возвращает число сгоревших кредитов и число обработанных лотов.
 */
export function settleExpiry(ctx: Ctx, userId?: number): { burned: number; lots: number } {
  const { db, clock } = ctx;
  const nowIso = clock.now().toISOString();
  return db.tx((tx) => {
    const due = tx.query<{ id: number; user_id: number }>(
      `SELECT id, user_id FROM credit_lots
        WHERE expired_at IS NULL AND expires_at <= ? ${userId === undefined ? '' : 'AND user_id = ?'}
        ORDER BY expires_at, id`,
      userId === undefined ? [nowIso] : [nowIso, userId],
    );
    let burned = 0;
    for (const lot of due) {
      const remaining = lotRemaining(tx, lot.id);
      if (remaining > 0) {
        appendEntry(
          { db: tx, clock },
          {
            userId: lot.user_id,
            lotId: lot.id,
            delta: -remaining,
            reason: 'expire',
            memo: 'lot_expired',
            idemKey: `expire:${lot.id}`,
          },
        );
        burned += remaining;
      }
      tx.run('UPDATE credit_lots SET expired_at = ? WHERE id = ? AND expired_at IS NULL', [
        nowIso,
        lot.id,
      ]);
    }
    return { burned, lots: due.length };
  });
}

/** Доступный баланс: сумма журнала после обработки сгоревших лотов. */
export function balanceOf(ctx: Ctx, userId: number): number {
  settleExpiry(ctx, userId);
  return ledgerSum(ctx.db, userId);
}

function insufficient(available: number, needed: number): AppError {
  return new AppError(409, 'insufficient_credits', 'billing.error.insufficientCredits', {
    params: { available, needed },
  });
}

export interface LotAllocation {
  lotId: number;
  credits: number;
  unitPriceBani: number;
}

/** Сколько кредитов заказа сейчас удержано по каждому лоту (резерв минус возвраты резерва). */
function heldByLot(db: Db, orderId: string): LotAllocation[] {
  return db
    .query<{ lot_id: number; held: number; unit_price_bani: number }>(
      `SELECT e.lot_id AS lot_id, -SUM(e.delta) AS held, l.unit_price_bani AS unit_price_bani
         FROM credit_ledger e JOIN credit_lots l ON l.id = e.lot_id
        WHERE e.order_id = ? AND e.reason IN ('reserve', 'release')
        GROUP BY e.lot_id
       HAVING held <> 0
        ORDER BY l.expires_at, e.lot_id`,
      [orderId],
    )
    .map((r) => ({ lotId: r.lot_id, credits: r.held, unitPriceBani: r.unit_price_bani }));
}

function orderOwner(db: Db, orderId: string): number | undefined {
  return db.get<{ user_id: number }>(
    'SELECT user_id FROM credit_ledger WHERE order_id = ? LIMIT 1',
    [orderId],
  )?.user_id;
}

function isConsumed(db: Db, orderId: string): boolean {
  return (
    db.get("SELECT 1 AS x FROM credit_ledger WHERE order_id = ? AND reason = 'consume'", [
      orderId,
    ]) !== undefined
  );
}

/** Состояние заказа в журнале: сколько удержано и использован ли. */
export function orderState(
  db: Db,
  orderId: string,
): { held: number; consumed: boolean; lots: LotAllocation[] } {
  const lots = heldByLot(db, orderId);
  return {
    held: lots.reduce((sum, l) => sum + l.credits, 0),
    consumed: isConsumed(db, orderId),
    lots,
  };
}

function checkCount(count: number): void {
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError('Число кредитов — целое положительное число');
  }
}

/**
 * Резервирует `count` кредитов под заказ: списывает с лотов, ближайших к сгоранию.
 * Повтор с тем же заказом и тем же числом — без изменений (идемпотентно);
 * другое число при действующем резерве — 409. После возврата резерва заказ можно зарезервировать заново,
 * после использования (consume) — нельзя.
 */
export function reserveCredits(
  ctx: Ctx,
  userId: number,
  count: number,
  orderId: string,
): LotAllocation[] {
  checkCount(count);
  if (!orderId) throw new RangeError('Нужен идентификатор заказа');
  const { db, clock } = ctx;
  return db.tx((tx) => {
    const owner = orderOwner(tx, orderId);
    if (owner !== undefined && owner !== userId) {
      throw new AppError(409, 'order_owner_mismatch', 'billing.error.orderConflict');
    }
    if (isConsumed(tx, orderId)) {
      throw new AppError(409, 'reservation_consumed', 'billing.error.orderConflict');
    }
    const current = heldByLot(tx, orderId);
    const heldNow = current.reduce((sum, l) => sum + l.credits, 0);
    if (heldNow > 0) {
      if (heldNow === count) return current;
      throw new AppError(409, 'reservation_exists', 'billing.error.orderConflict');
    }
    settleExpiry({ db: tx, clock }, userId);
    const lots = lotsWithRemaining(tx, userId, { notExpiredAt: clock.now().toISOString() });
    const available = lots.reduce((sum, l) => sum + l.remaining, 0);
    if (available < count) throw insufficient(available, count);
    const taken: LotAllocation[] = [];
    let left = count;
    for (const lot of lots) {
      if (left === 0) break;
      const take = Math.min(left, lot.remaining);
      appendEntry(
        { db: tx, clock },
        { userId, lotId: lot.id, delta: -take, reason: 'reserve', orderId },
      );
      taken.push({ lotId: lot.id, credits: take, unitPriceBani: lot.unit_price_bani });
      left -= take;
    }
    return taken;
  });
}

/**
 * Кладёт кредиты обратно в лот. Если лот уже сгорел (срок вышел, пока кредиты были в резерве),
 * они тут же сгорают отдельной записью `expire`: баланс не растёт, а кредиты попадают в перенос.
 * Возвращает число кредитов, которые остались доступными.
 */
export function restoreToLot(
  ctx: Ctx,
  entry: Omit<NewEntry, 'lotId' | 'delta'> & { lotId: number; credits: number },
): number {
  const { db, clock } = ctx;
  return db.tx((tx) => {
    const { credits, ...rest } = entry;
    const id = appendEntry({ db: tx, clock }, { ...rest, delta: credits });
    if (id === null) return 0; // та же операция уже была записана
    const lot = getLot(tx, entry.lotId)!;
    const closed = lot.expired_at !== null;
    const due = lot.expired_at === null && lot.expires_at <= clock.now().toISOString();
    if (due) {
      settleExpiry({ db: tx, clock }, lot.user_id);
      return 0;
    }
    if (closed) {
      appendEntry(
        { db: tx, clock },
        {
          userId: lot.user_id,
          lotId: lot.id,
          delta: -credits,
          reason: 'expire',
          memo: 'restored_after_expiry',
          idemKey: `expire-late:${id}`,
        },
      );
      return 0;
    }
    return credits;
  });
}

export interface ReleaseResult {
  /** Сколько кредитов вернулось в доступный баланс. */
  released: number;
  /** Сколько вернулось в уже сгоревшие лоты и сразу сгорело. */
  expired: number;
}

/** Возвращает резерв заказа в лоты. Повтор — ничего не делает. Использованный заказ вернуть нельзя. */
export function releaseCredits(ctx: Ctx, orderId: string): ReleaseResult {
  const { db } = ctx;
  return db.tx((tx) => {
    const state = orderState(tx, orderId);
    if (state.consumed) {
      throw new AppError(409, 'reservation_consumed', 'billing.error.orderConflict');
    }
    const userId = orderOwner(tx, orderId);
    let released = 0;
    let total = 0;
    for (const lot of state.lots) {
      if (lot.credits <= 0) continue;
      total += lot.credits;
      released += restoreToLot(
        { db: tx, clock: ctx.clock },
        {
          userId: userId!,
          lotId: lot.lotId,
          credits: lot.credits,
          reason: 'release',
          orderId,
        },
      );
    }
    return { released, expired: total - released };
  });
}

export interface ConsumeResult {
  credits: number;
  lots: LotAllocation[];
  /** Повторный вызов: запись уже была. */
  alreadyConsumed: boolean;
}

/**
 * Отмечает, что зарезервированные кредиты заказа использованы (выдача или списание).
 * Баланс не меняется — кредиты ушли при резерве. Повтор безопасен.
 */
export function consumeCredits(ctx: Ctx, orderId: string): ConsumeResult {
  const { db, clock } = ctx;
  return db.tx((tx) => {
    const state = orderState(tx, orderId);
    const userId = orderOwner(tx, orderId);
    if (state.consumed) return { credits: 0, lots: [], alreadyConsumed: true };
    if (userId === undefined || state.held <= 0) {
      throw new AppError(409, 'nothing_reserved', 'billing.error.orderConflict');
    }
    appendEntry(
      { db: tx, clock },
      { userId, lotId: null, delta: 0, reason: 'consume', orderId, idemKey: `consume:${orderId}` },
    );
    return { credits: state.held, lots: state.lots, alreadyConsumed: false };
  });
}

export interface GrantInput {
  userId: number;
  source: Exclude<LotSource, 'carryover'>;
  credits: number;
  unitPriceBani: number;
  validityDays: number;
  reason: Extract<LedgerReason, 'purchase' | 'complaint_credit'>;
  purchaseId?: number;
  complaintId?: string;
  memo?: string;
  idemKey: string;
}

/** Создаёт лот и первую запись журнала. Повтор с тем же ключом — возвращает null и ничего не меняет. */
export function grantLot(ctx: Ctx, input: GrantInput): { lotId: number; expiresAt: string } | null {
  checkCount(input.credits);
  const { db, clock } = ctx;
  return db.tx((tx) => {
    const duplicate = tx.get('SELECT 1 AS x FROM credit_ledger WHERE idem_key = ?', [
      input.idemKey,
    ]);
    if (duplicate) return null;
    const expiresAt = addDaysIso(clock.now(), input.validityDays);
    const lotId = insertLot(
      { db: tx, clock },
      {
        userId: input.userId,
        source: input.source,
        credits: input.credits,
        unitPriceBani: input.unitPriceBani,
        expiresAt,
        ...(input.purchaseId !== undefined ? { purchaseId: input.purchaseId } : {}),
      },
    );
    appendEntry(
      { db: tx, clock },
      {
        userId: input.userId,
        lotId,
        delta: input.credits,
        reason: input.reason,
        idemKey: input.idemKey,
        ...(input.purchaseId !== undefined ? { purchaseId: input.purchaseId } : {}),
        ...(input.complaintId !== undefined ? { complaintId: input.complaintId } : {}),
        ...(input.memo !== undefined ? { memo: input.memo } : {}),
      },
    );
    return { lotId, expiresAt };
  });
}

export interface CarryoverCandidate {
  lotId: number;
  available: number;
  unitPriceBani: number;
}

/**
 * Сгоревшие за последние 45 дней кредиты, которые ещё не переносились.
 * Перенесённые лоты сами не переносятся повторно: перенос работает один раз.
 */
export function carryoverCandidates(ctx: Ctx, userId: number): CarryoverCandidate[] {
  const { db, clock } = ctx;
  const now = clock.now();
  const windowStart = addDaysIso(now, -CARRYOVER_WINDOW_DAYS);
  return db
    .query<{ id: number; unit_price_bani: number; burned: number; carried: number }>(
      `SELECT l.id, l.unit_price_bani,
              COALESCE((SELECT -SUM(delta) FROM credit_ledger WHERE lot_id = l.id AND reason = 'expire'), 0) AS burned,
              COALESCE((SELECT SUM(credits) FROM credit_lots c WHERE c.origin_lot_id = l.id), 0) AS carried
         FROM credit_lots l
        WHERE l.user_id = ? AND l.source <> 'carryover'
          AND l.expired_at IS NOT NULL AND l.expires_at <= ? AND l.expires_at > ?
        ORDER BY l.expires_at, l.id`,
      [userId, now.toISOString(), windowStart],
    )
    .map((r) => ({
      lotId: r.id,
      available: r.burned - r.carried,
      unitPriceBani: r.unit_price_bani,
    }))
    .filter((c) => c.available > 0);
}

/**
 * Переносит до CARRYOVER_MAX сгоревших кредитов в новый лот покупки: отдельные лоты `carryover`
 * (по одному на исходный лот) со сроком нового пакета. Возвращает число перенесённых кредитов.
 */
export function carryOver(
  ctx: Ctx,
  input: { userId: number; purchaseId: number; expiresAt: string },
): number {
  const { db, clock } = ctx;
  return db.tx((tx) => {
    settleExpiry({ db: tx, clock }, input.userId);
    let left = CARRYOVER_MAX;
    let moved = 0;
    for (const candidate of carryoverCandidates({ db: tx, clock }, input.userId)) {
      if (left === 0) break;
      const take = Math.min(left, candidate.available);
      const lotId = insertLot(
        { db: tx, clock },
        {
          userId: input.userId,
          source: 'carryover',
          credits: take,
          unitPriceBani: candidate.unitPriceBani,
          expiresAt: input.expiresAt,
          purchaseId: input.purchaseId,
          originLotId: candidate.lotId,
        },
      );
      appendEntry(
        { db: tx, clock },
        {
          userId: input.userId,
          lotId,
          delta: take,
          reason: 'carryover',
          purchaseId: input.purchaseId,
          idemKey: `carryover:${input.purchaseId}:${candidate.lotId}`,
        },
      );
      left -= take;
      moved += take;
    }
    return moved;
  });
}
