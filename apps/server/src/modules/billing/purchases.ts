// Покупки: попытка оплаты → колбэк шлюза → лот кредитов.
//
// Надёжность денег держится на трёх вещах:
//   1. ключ идемпотентности покупки (user_id + idempotency_key): двойное нажатие даёт ту же покупку;
//   2. таблица payment_events: повторный колбэк с тем же eventId ничего не меняет;
//   3. зачисление в одной транзакции со сменой статуса на paid, плюс уникальный лот на покупку
//      и уникальный ключ журнала `purchase:<id>` — даже обходные пути не зачислят дважды.
// Данных карты здесь нет: клиента отправляют на страницу шлюза, а мы получаем только статус.
import { PENDING_TTL_MINUTES } from '@sportpit/shared/schemas/billing';
import type {
  FailureCode,
  PaymentMethod,
  PromoKind,
  PurchaseCreate,
  PurchaseDto,
  PurchaseStatus,
} from '@sportpit/shared/schemas/billing';
import type { AppDeps } from '../../app.ts';
import {
  InvalidCallbackError,
  type CallbackInput,
  type PaymentStatus,
} from '../adapters/payment.ts';
import type { Db } from '../db/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { EVENT_KINDS } from '../system/events.ts';
import { carryOver, grantLot } from './ledger.ts';
import { getPackageRow } from './packages.ts';
import { priceFor } from './pricing.ts';
import { reservePromo, settlePromo, validatePromo } from './promos.ts';

export type PurchaseDeps = Pick<AppDeps, 'db' | 'clock' | 'payment' | 'config' | 'system'>;

export interface PurchaseRow {
  id: number;
  user_id: number;
  package_id: number;
  boxes: number;
  validity_days: number;
  list_price_per_box_bani: number;
  unit_price_bani: number;
  discount_bani: number;
  total_bani: number;
  promo_id: number | null;
  method: PaymentMethod;
  status: PurchaseStatus;
  failure_code: FailureCode | null;
  failure_reason: string | null;
  idempotency_key: string;
  provider: string | null;
  provider_payment_id: string | null;
  redirect_url: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

const STATUS_POLL_GAP_MS = 30_000;

export function getPurchaseRow(db: Db, id: number): PurchaseRow | undefined {
  return db.get<PurchaseRow>('SELECT * FROM purchases WHERE id = ?', [id]);
}

export function toPurchaseDto(deps: PurchaseDeps, row: PurchaseRow): PurchaseDto {
  const { db } = deps;
  const promo =
    row.promo_id === null
      ? null
      : (db.get<{ code: string }>('SELECT code FROM promo_codes WHERE id = ?', [row.promo_id])
          ?.code ?? null);
  const lot = db.get<{ expires_at: string }>(
    "SELECT expires_at FROM credit_lots WHERE purchase_id = ? AND source = 'purchase'",
    [row.id],
  );
  const carried = db.get<{ n: number }>(
    "SELECT COALESCE(SUM(credits), 0) AS n FROM credit_lots WHERE purchase_id = ? AND source = 'carryover'",
    [row.id],
  )!.n;
  return {
    id: row.id,
    status: row.status,
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    packageId: row.package_id,
    boxes: row.boxes,
    listPricePerBoxBani: row.list_price_per_box_bani,
    unitPriceBani: row.unit_price_bani,
    discountBani: row.discount_bani,
    totalBani: row.total_bani,
    promoCode: promo,
    method: row.method,
    redirectUrl: row.status === 'pending' ? row.redirect_url : null,
    stubGateway: deps.payment.provider === 'stub',
    createdAt: row.created_at,
    paidAt: row.paid_at,
    expiresAt: lot?.expires_at ?? null,
    carriedOver: carried,
  };
}

// ---- смена статуса (всегда внутри транзакции вызывающего) ----

/**
 * pending|failed → paid: статус, лот, запись журнала, промокод и перенос — одной транзакцией.
 * Возвращает false, если покупка уже оплачена (повтор): тогда ничего не меняется.
 */
function markPaid(deps: PurchaseDeps, tx: Db, purchase: PurchaseRow): boolean {
  const { clock } = deps;
  const now = clock.now().toISOString();
  const changed = tx.run(
    `UPDATE purchases SET status = 'paid', failure_code = NULL, failure_reason = NULL,
            paid_at = ?, updated_at = ? WHERE id = ? AND status <> 'paid'`,
    [now, now, purchase.id],
  ).changes;
  if (changed === 0) return false;
  const lot = grantLot(
    { db: tx, clock },
    {
      userId: purchase.user_id,
      source: 'purchase',
      credits: purchase.boxes,
      unitPriceBani: purchase.unit_price_bani,
      validityDays: purchase.validity_days,
      reason: 'purchase',
      purchaseId: purchase.id,
      idemKey: `purchase:${purchase.id}`,
    },
  );
  if (!lot) throw new Error(`Покупка ${purchase.id} уже зачислена`);
  settlePromo(tx, clock, purchase.id, 'redeemed');
  carryOver(
    { db: tx, clock },
    { userId: purchase.user_id, purchaseId: purchase.id, expiresAt: lot.expiresAt },
  );
  return true;
}

/** pending → failed. Оплаченную покупку не трогает. Пишет событие `payment_failed`. */
function markFailed(
  deps: PurchaseDeps,
  tx: Db,
  purchase: PurchaseRow,
  code: FailureCode,
  reason: string | null,
): boolean {
  const { clock } = deps;
  const changed = tx.run(
    `UPDATE purchases SET status = 'failed', failure_code = ?, failure_reason = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'`,
    [code, reason, clock.now().toISOString(), purchase.id],
  ).changes;
  if (changed === 0) return false;
  settlePromo(tx, clock, purchase.id, 'released');
  // отказ и просрочка — сбой оплаты для журнала событий; отмену клиентом и недоступность шлюза
  // (её уже записала обёртка адаптера) второй раз не пишем
  if (code === 'declined' || code === 'expired') {
    deps.system.logEvent(EVENT_KINDS.paymentFailed, {
      purchaseId: purchase.id,
      code,
      ...(reason ? { reason } : {}),
    });
  }
  return true;
}

/** Применяет итог от шлюза к покупке. Возвращает, изменилось ли что-то. */
function applyGatewayStatus(
  deps: PurchaseDeps,
  tx: Db,
  purchase: PurchaseRow,
  status: PaymentStatus,
  failureReason?: string,
): boolean {
  if (status === 'paid') return markPaid(deps, tx, purchase);
  if (status === 'failed') {
    return markFailed(deps, tx, purchase, 'declined', failureReason?.slice(0, 300) ?? null);
  }
  return false;
}

function recordEvent(deps: PurchaseDeps, tx: Db, provider: string, eventId: string, id: number) {
  return (
    tx.run(
      `INSERT INTO payment_events (provider, event_id, purchase_id, received_at)
       VALUES (?, ?, ?, ?) ON CONFLICT (provider, event_id) DO NOTHING`,
      [provider, eventId, id, deps.clock.now().toISOString()],
    ).changes === 1
  );
}

// ---- запуск покупки ----

function conflict(): AppError {
  return new AppError(409, 'idempotency_conflict', 'billing.error.idempotencyConflict');
}

export async function startPurchase(
  deps: PurchaseDeps,
  userId: number,
  input: PurchaseCreate,
): Promise<{ purchase: PurchaseDto; created: boolean }> {
  const { db, clock } = deps;

  // Фаза А — всё, что решается по нашей базе, одной транзакцией.
  const phaseA = db.tx((tx) => {
    const existing = tx.get<PurchaseRow>(
      'SELECT * FROM purchases WHERE user_id = ? AND idempotency_key = ?',
      [userId, input.idempotencyKey],
    );
    if (existing) {
      const sameCode =
        (input.promoCode ?? null) === null
          ? existing.promo_id === null
          : existing.promo_id !== null &&
            tx.get<{ code: string }>('SELECT code FROM promo_codes WHERE id = ?', [
              existing.promo_id,
            ])?.code === input.promoCode!.trim().toUpperCase();
      if (
        existing.package_id !== input.packageId ||
        existing.method !== input.method ||
        !sameCode
      ) {
        throw conflict();
      }
      return { row: existing, created: false };
    }
    const pack = getPackageRow(tx, input.packageId);
    if (!pack || pack.active !== 1) {
      throw new AppError(404, 'package_unavailable', 'billing.error.packageUnavailable');
    }
    let promo: { id: number; kind: PromoKind; value: number } | undefined;
    if (input.promoCode) {
      const checked = validatePromo(tx, clock, userId, input.promoCode);
      if (checked.kind === 'free_credits') {
        throw new AppError(400, 'promo_free_credits', 'billing.error.promoFreeCredits');
      }
      promo = { id: checked.id, kind: checked.kind, value: checked.value };
    }
    const price = priceFor({
      boxes: pack.boxes,
      listPricePerBoxBani: pack.price_per_box_bani,
      promo,
    });
    const now = clock.now().toISOString();
    const { lastInsertRowid } = tx.run(
      `INSERT INTO purchases
         (user_id, package_id, boxes, validity_days, list_price_per_box_bani, unit_price_bani,
          discount_bani, total_bani, promo_id, method, status, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        userId,
        pack.id,
        pack.boxes,
        pack.validity_days,
        pack.price_per_box_bani,
        price.unitPriceBani,
        price.discountBani,
        price.totalBani,
        promo?.id ?? null,
        input.method,
        input.idempotencyKey,
        now,
        now,
      ],
    );
    const id = Number(lastInsertRowid);
    if (promo) reservePromo(tx, clock, promo.id, userId, id);
    if (price.totalBani === 0) {
      // полностью покрыто промокодом: платить нечего, шлюз не нужен
      tx.run("UPDATE purchases SET provider = 'free' WHERE id = ?", [id]);
      markPaid(deps, tx, getPurchaseRow(tx, id)!);
    }
    return { row: getPurchaseRow(tx, id)!, created: true };
  });

  // Фаза Б — обращение к шлюзу вне транзакции (оно асинхронное).
  await ensureGatewayPayment(deps, phaseA.row.id);
  const row = getPurchaseRow(db, phaseA.row.id)!;
  return { purchase: toPurchaseDto(deps, row), created: phaseA.created };
}

/** Создаёт платёж у шлюза, если его ещё нет. Безопасно вызывать повторно и параллельно. */
async function ensureGatewayPayment(deps: PurchaseDeps, purchaseId: number): Promise<void> {
  const { db } = deps;
  const row = getPurchaseRow(db, purchaseId)!;
  if (row.status !== 'pending' || row.provider_payment_id) return;
  const stub = deps.payment.provider === 'stub';
  let result;
  try {
    result = await deps.payment.createPayment({
      reference: String(row.id),
      amountBani: row.total_bani,
      currency: 'MDL',
      method: row.method,
      returnUrl: `${deps.config.publicBaseUrl.replace(/\/$/, '')}/pay/${row.id}`,
      // ключ шлюза не зависит от клиента: одна покупка — один платёж, сколько бы раз ни вызвали
      idempotencyKey: `purchase-${row.id}`,
      description: `SportPit: ${row.boxes}`,
    });
  } catch {
    // сбой уже записан в журнал событий обёрткой адаптера; кредиты не зачисляются, можно повторить
    db.tx((tx) => {
      const current = getPurchaseRow(tx, purchaseId)!;
      if (!current.provider_payment_id) markFailed(deps, tx, current, 'error', null);
    });
    return;
  }
  db.tx((tx) => {
    const current = getPurchaseRow(tx, purchaseId)!;
    if (current.status === 'pending' && !current.provider_payment_id) {
      tx.run(
        `UPDATE purchases SET provider = ?, provider_payment_id = ?, redirect_url = ?, updated_at = ?
          WHERE id = ?`,
        [
          deps.payment.provider,
          result.providerPaymentId,
          stub ? `/pay/stub/${current.id}` : result.redirectUrl,
          deps.clock.now().toISOString(),
          current.id,
        ],
      );
    }
    const fresh = getPurchaseRow(tx, purchaseId)!;
    if (fresh.provider_payment_id !== result.providerPaymentId) return;
    // платёж мог завершиться сразу (заглушка): обрабатываем как событие, один раз
    if (
      result.status !== 'pending' &&
      recordEvent(deps, tx, deps.payment.provider, `create:${result.providerPaymentId}`, fresh.id)
    ) {
      applyGatewayStatus(deps, tx, fresh, result.status, undefined);
    }
  });
}

// ---- колбэк шлюза ----

export function handleGatewayCallback(
  deps: PurchaseDeps,
  input: CallbackInput,
): { purchase: PurchaseDto; duplicate: boolean } {
  const { db } = deps;
  let callback;
  try {
    callback = deps.payment.parseCallback(input);
  } catch (error) {
    if (error instanceof InvalidCallbackError) {
      throw new AppError(400, 'invalid_callback', 'billing.error.invalidCallback');
    }
    throw error;
  }
  return db.tx((tx) => {
    const row = tx.get<PurchaseRow>(
      'SELECT * FROM purchases WHERE provider = ? AND provider_payment_id = ?',
      [deps.payment.provider, callback.providerPaymentId],
    );
    // платёж ещё не привязан к покупке (колбэк обогнал ответ шлюза) — пусть шлюз повторит позже
    if (!row) throw new AppError(404, 'payment_unknown', 'billing.error.paymentUnknown');
    const isNew = recordEvent(deps, tx, deps.payment.provider, callback.eventId, row.id);
    if (isNew) {
      applyGatewayStatus(deps, tx, row, callback.status, callback.failureReason);
    }
    return { purchase: toPurchaseDto(deps, getPurchaseRow(tx, row.id)!), duplicate: !isNew };
  });
}

// ---- опрос шлюза, отмена, просроченные ----

/**
 * Сверяет ожидающую покупку со шлюзом (колбэк мог потеряться) и закрывает просроченную.
 * `force` — спросить шлюз прямо сейчас; иначе не чаще раза в 30 секунд на покупку.
 */
export async function refreshPurchase(
  deps: PurchaseDeps,
  purchaseId: number,
  options: { force?: boolean } = {},
): Promise<PurchaseRow> {
  const { db, clock } = deps;
  const row = getPurchaseRow(db, purchaseId);
  if (!row) throw errors.notFound('billing.error.purchaseNotFound');
  if (row.status !== 'pending') return row;
  const now = clock.now().getTime();
  const stale = now - Date.parse(row.updated_at) >= STATUS_POLL_GAP_MS;
  if (row.provider_payment_id && (options.force || stale)) {
    try {
      const state = await deps.payment.getPayment(row.provider_payment_id);
      db.tx((tx) => {
        const current = getPurchaseRow(tx, purchaseId)!;
        const changed = applyGatewayStatus(deps, tx, current, state.status, state.failureReason);
        if (!changed && current.status === 'pending') {
          tx.run('UPDATE purchases SET updated_at = ? WHERE id = ?', [
            clock.now().toISOString(),
            purchaseId,
          ]);
        }
      });
    } catch {
      // шлюз не ответил: сбой записан обёрткой адаптера, покупка остаётся ожидающей
    }
  }
  db.tx((tx) => {
    const current = getPurchaseRow(tx, purchaseId)!;
    const age = clock.now().getTime() - Date.parse(current.created_at);
    if (current.status === 'pending' && age >= PENDING_TTL_MINUTES * 60_000) {
      markFailed(deps, tx, current, 'expired', null);
    }
  });
  return getPurchaseRow(db, purchaseId)!;
}

/** Клиент отказался платить. Если шлюз уже принял деньги — покупка оплачена, отмена не применяется. */
export async function cancelPurchase(deps: PurchaseDeps, purchaseId: number): Promise<PurchaseRow> {
  await refreshPurchase(deps, purchaseId, { force: true });
  deps.db.tx((tx) => {
    const current = getPurchaseRow(tx, purchaseId)!;
    markFailed(deps, tx, current, 'cancelled', null);
  });
  return getPurchaseRow(deps.db, purchaseId)!;
}

/** Закрывает ожидающие покупки старше PENDING_TTL_MINUTES (ночью и по требованию). */
export async function expirePendingPurchases(deps: PurchaseDeps): Promise<number> {
  const { db, clock } = deps;
  const cutoff = new Date(clock.now().getTime() - PENDING_TTL_MINUTES * 60_000).toISOString();
  const ids = db
    .query<{ id: number }>(
      "SELECT id FROM purchases WHERE status = 'pending' AND created_at <= ? ORDER BY id",
      [cutoff],
    )
    .map((r) => r.id);
  let closed = 0;
  for (const id of ids) {
    const row = await refreshPurchase(deps, id, { force: true });
    if (row.status === 'failed') closed += 1;
  }
  return closed;
}
