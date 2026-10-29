// Возвраты (R51): неиспользованные кредиты × цена кредита лота, с причиной, через шлюз.
//
// Порядок защищает от двойной выплаты: сначала кредиты списываются записью журнала (в минус лот
// не уйдёт — триггер и проверка), и только потом шлюзу уходит команда возврата.
//   — шлюз ответил «возврат выполнен» → запись done;
//   — шлюз ответил «отказ» → кредиты возвращаются компенсирующей записью adjustment, запись failed;
//   — шлюз не ответил (исключение) → запись остаётся pending, кредиты списаны, администратор повторяет
//     команду (ключ шлюзу тот же, поэтому деньги не вернутся дважды).
import type { AdminPurchaseDto, RefundCreate, RefundDto } from '@sportpit/shared/schemas/billing';
import { AppError, errors } from '../system/errors.ts';
import { EVENT_KINDS } from '../system/events.ts';
import { appendEntry, lotRemaining, restoreToLot, settleExpiry } from './ledger.ts';
import { getPurchaseRow, toPurchaseDto, type PurchaseDeps, type PurchaseRow } from './purchases.ts';

interface RefundRow {
  id: number;
  purchase_id: number;
  lot_id: number;
  user_id: number;
  admin_id: number | null;
  credits: number;
  unit_price_bani: number;
  amount_bani: number;
  reason: string;
  status: 'pending' | 'done' | 'failed';
  provider_refund_id: string | null;
  failure_detail: string | null;
  created_at: string;
  phone: string | null;
}

const SELECT_REFUND = `SELECT r.*, u.phone AS phone FROM refunds r JOIN users u ON u.id = r.user_id`;

function toRefundDto(row: RefundRow): RefundDto {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    userId: row.user_id,
    userPhone: row.phone,
    credits: row.credits,
    amountBani: row.amount_bani,
    reason: row.reason,
    status: row.status,
    failureDetail: row.failure_detail,
    createdAt: row.created_at,
  };
}

function getRefund(deps: PurchaseDeps, id: number): RefundDto {
  const row = deps.db.get<RefundRow>(`${SELECT_REFUND} WHERE r.id = ?`, [id]);
  if (!row) throw errors.notFound('billing.error.refundNotFound');
  return toRefundDto(row);
}

export function listRefunds(
  deps: PurchaseDeps,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): RefundDto[] {
  return deps.db
    .query<RefundRow>(`${SELECT_REFUND} ORDER BY r.id DESC LIMIT ? OFFSET ?`, [
      Math.min(Math.max(limit, 1), 200),
      Math.max(offset, 0),
    ])
    .map(toRefundDto);
}

function purchaseLotId(deps: PurchaseDeps, purchaseId: number): number | undefined {
  return deps.db.get<{ id: number }>(
    "SELECT id FROM credit_lots WHERE purchase_id = ? AND source = 'purchase'",
    [purchaseId],
  )?.id;
}

/** Оформляет возврат. Бросает 409, если возвращать нечего или просят больше неиспользованного. */
export async function createRefund(
  deps: PurchaseDeps,
  adminId: number | null,
  input: RefundCreate,
): Promise<RefundDto> {
  const { db, clock } = deps;
  const refundId = db.tx((tx) => {
    const purchase = getPurchaseRow(tx, input.purchaseId);
    if (!purchase) throw errors.notFound('billing.error.purchaseNotFound');
    const lotId = purchaseLotId(deps, purchase.id);
    if (
      purchase.status !== 'paid' ||
      !purchase.provider_payment_id ||
      purchase.unit_price_bani <= 0 ||
      lotId === undefined
    ) {
      throw new AppError(409, 'refund_not_possible', 'billing.error.refundNotPossible');
    }
    settleExpiry({ db: tx, clock }, purchase.user_id);
    const unused = lotRemaining(tx, lotId);
    if (unused <= 0) throw new AppError(409, 'nothing_to_refund', 'billing.error.nothingToRefund');
    const credits = input.credits ?? unused;
    if (credits > unused) {
      throw new AppError(409, 'refund_exceeds_unused', 'billing.error.refundExceedsUnused', {
        params: { unused },
      });
    }
    const { lastInsertRowid } = tx.run(
      `INSERT INTO refunds
         (purchase_id, lot_id, user_id, admin_id, credits, unit_price_bani, amount_bani, reason,
          status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        purchase.id,
        lotId,
        purchase.user_id,
        adminId,
        credits,
        purchase.unit_price_bani,
        credits * purchase.unit_price_bani,
        input.reason,
        clock.now().toISOString(),
        clock.now().toISOString(),
      ],
    );
    const id = Number(lastInsertRowid);
    appendEntry(
      { db: tx, clock },
      {
        userId: purchase.user_id,
        lotId,
        delta: -credits,
        reason: 'refund',
        purchaseId: purchase.id,
        refundId: id,
        memo: input.reason.slice(0, 200),
        idemKey: `refund:${id}`,
      },
    );
    return id;
  });
  return processRefund(deps, refundId);
}

/** Отправляет команду возврата шлюзу для ожидающей записи (первый раз и при повторе). */
export async function processRefund(deps: PurchaseDeps, refundId: number): Promise<RefundDto> {
  const { db, clock } = deps;
  const row = db.get<RefundRow>(`${SELECT_REFUND} WHERE r.id = ?`, [refundId]);
  if (!row) throw errors.notFound('billing.error.refundNotFound');
  if (row.status !== 'pending') return toRefundDto(row);
  const purchase = getPurchaseRow(db, row.purchase_id) as PurchaseRow;

  let result;
  try {
    result = await deps.payment.refund({
      providerPaymentId: purchase.provider_payment_id!,
      amountBani: row.amount_bani,
      reason: row.reason,
      idempotencyKey: `refund-${row.id}`,
    });
  } catch {
    // шлюз недоступен (сбой записан обёрткой адаптера): запись остаётся ожидающей, можно повторить
    db.run(
      `UPDATE refunds SET failure_detail = 'gateway_error', updated_at = ?
        WHERE id = ? AND status = 'pending'`,
      [clock.now().toISOString(), row.id],
    );
    return getRefund(deps, row.id);
  }

  db.tx((tx) => {
    const now = clock.now().toISOString();
    if (result.status === 'failed') {
      const changed = tx.run(
        `UPDATE refunds SET status = 'failed', failure_detail = 'gateway_declined', updated_at = ?
          WHERE id = ? AND status = 'pending'`,
        [now, row.id],
      ).changes;
      if (changed === 0) return;
      restoreToLot(
        { db: tx, clock },
        {
          userId: row.user_id,
          lotId: row.lot_id,
          credits: row.credits,
          reason: 'adjustment',
          refundId: row.id,
          memo: 'refund_failed',
          idemKey: `refund-revert:${row.id}`,
        },
      );
      deps.system.logEvent(EVENT_KINDS.paymentFailed, {
        operation: 'refund',
        refundId: row.id,
        purchaseId: row.purchase_id,
      });
      return;
    }
    tx.run(
      `UPDATE refunds SET status = ?, provider_refund_id = ?, failure_detail = NULL, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
      [result.status === 'done' ? 'done' : 'pending', result.providerRefundId, now, row.id],
    );
  });
  return getRefund(deps, row.id);
}

// ---- покупки для администратора ----

interface AdminPurchaseRow extends PurchaseRow {
  phone: string | null;
}

export function listAdminPurchases(
  deps: PurchaseDeps,
  options: { q?: string; limit?: number; offset?: number } = {},
): AdminPurchaseDto[] {
  const { db } = deps;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const q = options.q?.trim();
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (q) {
    where.push('(u.phone LIKE ? OR p.id = ?)');
    params.push(`%${q.replace(/[%_]/g, '')}%`, /^\d+$/.test(q) ? Number(q) : -1);
  }
  const rows = db.query<AdminPurchaseRow>(
    `SELECT p.*, u.phone AS phone FROM purchases p JOIN users u ON u.id = p.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.map((row) => {
    const lotId = purchaseLotId(deps, row.id);
    const unused = lotId === undefined ? 0 : lotRemaining(db, lotId);
    const refunded = db.get<{ n: number }>(
      "SELECT COALESCE(SUM(amount_bani), 0) AS n FROM refunds WHERE purchase_id = ? AND status IN ('done', 'pending')",
      [row.id],
    )!.n;
    const refundable =
      row.status === 'paid' && row.provider_payment_id && row.unit_price_bani > 0
        ? unused * row.unit_price_bani
        : 0;
    return {
      ...toPurchaseDto(deps, row),
      userId: row.user_id,
      userPhone: row.phone,
      unusedCredits: unused,
      refundableBani: refundable,
      refundedBani: refunded,
    };
  });
}
