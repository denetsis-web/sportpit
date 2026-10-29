// Модуль billing: пакеты, покупки и оплата, лоты кредитов, журнал, промокоды, возвраты.
// Другие модули пользуются так (один набор зависимостей — один сервис):
//   billingFor(deps).balance(userId)                      — доступные кредиты (сумма журнала);
//   billingFor(deps).reserve(userId, count, orderId)      — резерв под заказ (бросает 409 insufficient_credits);
//   billingFor(deps).release(orderId)                     — вернуть резерв (отмена заказа), повтор безопасен;
//   billingFor(deps).consume(orderId)                     — кредиты использованы (выдача или списание бокса);
//   billingFor(deps).grantComplaintCredit(userId, id)     — +1 кредит по жалобе, повтор по тому же id безопасен;
//   billingFor(deps).orderCredits(orderId)                — по каким лотам и по какой цене заказ взял кредиты
//                                                           (выручка бокса для отчётов — цена кредита лота).
// То же короткими функциями: balance(deps, userId), reserve(deps, ...), release(deps, orderId) и т. д.
//
// Списания и возвраты резерва внутри транзакции вызывающего (`db.tx`) откатываются вместе с ней.
import { LOT_VALIDITY_DAYS } from '@sportpit/shared/schemas/billing';
import type {
  BalanceResponse,
  LedgerEntryDto,
  PackageCreate,
  PackageDto,
  PackageUpdate,
  PromoApplyResponse,
  PromoCreate,
  PromoDto,
  PromoUpdate,
  PurchaseCreate,
  PurchaseDto,
  RefundCreate,
  RefundDto,
} from '@sportpit/shared/schemas/billing';
import type { AppDeps } from '../../app.ts';
import type { CallbackInput } from '../adapters/payment.ts';
import { errors } from '../system/errors.ts';
import { setAuditSink, type AuditSink } from './audit.ts';
import {
  balanceOf,
  consumeCredits,
  grantLot,
  ledgerSum,
  lotsWithRemaining,
  orderState,
  releaseCredits,
  reserveCredits,
  settleExpiry,
  type ConsumeResult,
  type LotAllocation,
  type ReleaseResult,
} from './ledger.ts';
import { notifyExpiring } from './expiry.ts';
import { createPackage, getPackageRow, listPackages, updatePackage } from './packages.ts';
import { priceFor } from './pricing.ts';
import {
  createPromo,
  listPromos,
  redeemFreeCredits,
  updatePromo,
  validatePromo,
} from './promos.ts';
import {
  cancelPurchase,
  expirePendingPurchases,
  getPurchaseRow,
  handleGatewayCallback,
  refreshPurchase,
  startPurchase,
  toPurchaseDto,
} from './purchases.ts';
import { createRefund, listAdminPurchases, listRefunds, processRefund } from './refunds.ts';

export { setAuditSink, type AuditSink };
export type { ConsumeResult, LotAllocation, ReleaseResult };

export type BillingDeps = Pick<AppDeps, 'db' | 'clock' | 'payment' | 'config' | 'system'>;

export interface BillingApi {
  // ---- контракт для заказов, выдачи и жалоб ----
  /** Доступные кредиты: сумма журнала. Сгоревшие лоты к этому моменту уже обработаны. */
  balance(userId: number): number;
  balanceDetails(userId: number): BalanceResponse;
  reserve(userId: number, count: number, orderId: string): LotAllocation[];
  release(orderId: string): ReleaseResult;
  consume(orderId: string): ConsumeResult;
  /** Состояние заказа в журнале: удержано, использовано, по каким лотам. */
  orderCredits(orderId: string): {
    held: number;
    consumed: boolean;
    lots: LotAllocation[];
  };
  grantComplaintCredit(userId: number, complaintId: string): { granted: boolean; lotId: number };

  // ---- пакеты, покупки, промокоды, возвраты ----
  listPackages(options?: { includeInactive?: boolean }): PackageDto[];
  startPurchase(
    userId: number,
    input: PurchaseCreate,
  ): Promise<{ purchase: PurchaseDto; created: boolean }>;
  handleGatewayCallback(input: CallbackInput): { purchase: PurchaseDto; duplicate: boolean };
  getPurchase(userId: number, id: number): Promise<PurchaseDto>;
  cancelPurchase(userId: number, id: number): Promise<PurchaseDto>;
  applyPromo(userId: number, code: string, packageId?: number): PromoApplyResponse;
  refund(adminId: number | null, input: RefundCreate): Promise<RefundDto>;
  retryRefund(refundId: number): Promise<RefundDto>;
  listRefunds(options?: { limit?: number; offset?: number }): RefundDto[];

  // ---- администрирование ----
  createPackage(input: PackageCreate): PackageDto;
  updatePackage(id: number, patch: PackageUpdate): PackageDto;
  listPromos(): PromoDto[];
  createPromo(input: PromoCreate): PromoDto;
  updatePromo(id: number, patch: PromoUpdate): PromoDto;
  listAdminPurchases(options?: {
    q?: string;
    limit?: number;
    offset?: number;
  }): ReturnType<typeof listAdminPurchases>;

  // ---- журнал и фоновые задачи ----
  ledger(userId: number, limit?: number): LedgerEntryDto[];
  /** Сжигает лоты с вышедшим сроком; идемпотентно, догоняет пропущенное. */
  expireDue(): { burned: number; lots: number };
  /** Уведомления за 7 дней до сгорания: по одному разу на лот. Возвращает число отправленных. */
  notifyExpiring(): number;
  expirePendingPurchases(): Promise<number>;
}

const instances = new WeakMap<object, BillingApi>();

export function billingFor(deps: BillingDeps): BillingApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock } = deps;
  const ctx = { db, clock };

  const owned = (userId: number, id: number) => {
    const row = getPurchaseRow(db, id);
    if (!row || row.user_id !== userId) throw errors.notFound('billing.error.purchaseNotFound');
    return row;
  };

  const api: BillingApi = {
    balance: (userId) => balanceOf(ctx, userId),
    balanceDetails(userId) {
      const balance = balanceOf(ctx, userId);
      const lots = lotsWithRemaining(db, userId, { notExpiredAt: clock.now().toISOString() });
      return {
        balance,
        lots: lots.map((l) => ({
          id: l.id,
          source: l.source,
          remaining: l.remaining,
          unitPriceBani: l.unit_price_bani,
          createdAt: l.created_at,
          expiresAt: l.expires_at,
        })),
      };
    },
    reserve: (userId, count, orderId) => reserveCredits(ctx, userId, count, orderId),
    release: (orderId) => releaseCredits(ctx, orderId),
    consume: (orderId) => consumeCredits(ctx, orderId),
    orderCredits: (orderId) => orderState(db, orderId),
    grantComplaintCredit(userId, complaintId) {
      if (!complaintId) throw new RangeError('Нужен идентификатор жалобы');
      return db.tx((tx) => {
        const idemKey = `complaint:${complaintId}`;
        const granted = grantLot(
          { db: tx, clock },
          {
            userId,
            source: 'complaint',
            credits: 1,
            unitPriceBani: 0,
            validityDays: LOT_VALIDITY_DAYS,
            reason: 'complaint_credit',
            complaintId,
            idemKey,
          },
        );
        if (granted) return { granted: true, lotId: granted.lotId };
        const prior = tx.get<{ lot_id: number; user_id: number }>(
          'SELECT lot_id, user_id FROM credit_ledger WHERE idem_key = ?',
          [idemKey],
        )!;
        if (prior.user_id !== userId) {
          throw new RangeError('Жалоба уже закрыта кредитом другого клиента');
        }
        return { granted: false, lotId: prior.lot_id };
      });
    },

    listPackages: (options) => listPackages(db, options),
    startPurchase: (userId, input) => startPurchase(deps, userId, input),
    handleGatewayCallback: (input) => handleGatewayCallback(deps, input),
    async getPurchase(userId, id) {
      owned(userId, id);
      const row = await refreshPurchase(deps, id);
      return toPurchaseDto(deps, row);
    },
    async cancelPurchase(userId, id) {
      owned(userId, id);
      return toPurchaseDto(deps, await cancelPurchase(deps, id));
    },
    applyPromo(userId, code, packageId) {
      const promo = validatePromo(db, clock, userId, code);
      if (promo.kind === 'free_credits') {
        const credits = redeemFreeCredits(ctx, userId, code);
        return {
          code: promo.code,
          kind: promo.kind,
          discountBani: 0,
          totalBani: null,
          unitPriceBani: null,
          creditsGranted: credits,
        };
      }
      if (packageId === undefined) {
        return {
          code: promo.code,
          kind: promo.kind,
          discountBani: 0,
          totalBani: null,
          unitPriceBani: null,
          creditsGranted: 0,
        };
      }
      const pack = getPackageRow(db, packageId);
      if (!pack || pack.active !== 1) throw errors.notFound('billing.error.packageUnavailable');
      const price = priceFor({
        boxes: pack.boxes,
        listPricePerBoxBani: pack.price_per_box_bani,
        promo: { kind: promo.kind, value: promo.value },
      });
      return {
        code: promo.code,
        kind: promo.kind,
        discountBani: price.discountBani,
        totalBani: price.totalBani,
        unitPriceBani: price.unitPriceBani,
        creditsGranted: 0,
      };
    },
    refund: (adminId, input) => createRefund(deps, adminId, input),
    retryRefund: (refundId) => processRefund(deps, refundId),
    listRefunds: (options) => listRefunds(deps, options),

    createPackage: (input) => createPackage(db, clock, input),
    updatePackage: (id, patch) => updatePackage(db, clock, id, patch),
    listPromos: () => listPromos(db),
    createPromo: (input) => createPromo(db, clock, input),
    updatePromo: (id, patch) => updatePromo(db, clock, id, patch),
    listAdminPurchases: (options) => listAdminPurchases(deps, options),

    ledger(userId, limit = 50) {
      settleExpiry(ctx, userId);
      return db
        .query<{ id: number; reason: LedgerEntryDto['reason']; delta: number; created_at: string }>(
          'SELECT id, reason, delta, created_at FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?',
          [userId, Math.min(Math.max(limit, 1), 200)],
        )
        .map((r) => ({ id: r.id, reason: r.reason, delta: r.delta, createdAt: r.created_at }));
    },
    expireDue: () => settleExpiry(ctx),
    notifyExpiring: () => notifyExpiring(deps),
    expirePendingPurchases: () => expirePendingPurchases(deps),
  };
  instances.set(deps, api);
  return api;
}

// Короткие записи для других модулей: `balance(deps, userId)`, `reserve(deps, userId, 2, orderId)`.
export const balance = (deps: BillingDeps, userId: number): number =>
  billingFor(deps).balance(userId);
export const reserve = (
  deps: BillingDeps,
  userId: number,
  count: number,
  orderId: string,
): LotAllocation[] => billingFor(deps).reserve(userId, count, orderId);
export const release = (deps: BillingDeps, orderId: string): ReleaseResult =>
  billingFor(deps).release(orderId);
export const consume = (deps: BillingDeps, orderId: string): ConsumeResult =>
  billingFor(deps).consume(orderId);
export const grantComplaintCredit = (
  deps: BillingDeps,
  userId: number,
  complaintId: string,
): { granted: boolean; lotId: number } =>
  billingFor(deps).grantComplaintCredit(userId, complaintId);
export const refund = (
  deps: BillingDeps,
  adminId: number | null,
  input: RefundCreate,
): Promise<RefundDto> => billingFor(deps).refund(adminId, input);
export const applyPromo = (
  deps: BillingDeps,
  userId: number,
  code: string,
  packageId?: number,
): PromoApplyResponse => billingFor(deps).applyPromo(userId, code, packageId);

/** Сумма журнала пользователя без обработки сгорания: для сверок («баланс = сумма журнала»). */
export const ledgerBalance = (deps: BillingDeps, userId: number): number =>
  ledgerSum(deps.db, userId);
