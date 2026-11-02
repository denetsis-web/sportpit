// Промокоды: процент, фиксированная сумма, бесплатные кредиты (R20.1).
// Проверяются срок (календарные дни по Кишинёву, обе границы включительно), лимит использований
// и «один раз на клиента». Использованием считается и покупка, ожидающая оплаты (reserved):
// иначе два клиента одновременно заняли бы последнее использование.
import type {
  PromoCreate,
  PromoDto,
  PromoKind,
  PromoUpdate,
} from '@sportpit/shared/schemas/billing';
import { LOT_VALIDITY_DAYS, promoRuleIssues } from '@sportpit/shared/schemas/billing';
import { isDateISO } from '@sportpit/shared/time';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { grantLot, type Ctx } from './ledger.ts';

export interface PromoRow {
  id: number;
  code: string;
  kind: PromoKind;
  value: number;
  owner_label: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  once_per_user: number;
  active: number;
}

const COLUMNS =
  'id, code, kind, value, owner_label, valid_from, valid_until, max_uses, once_per_user, active';

export const normalizeCode = (code: string): string => code.trim().toUpperCase();

export function usedCount(db: Db, promoId: number): number {
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM promo_redemptions WHERE promo_id = ? AND status IN ('reserved', 'redeemed')",
    [promoId],
  )!.n;
}

export function toPromoDto(db: Db, row: PromoRow): PromoDto {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: row.value,
    ownerLabel: row.owner_label,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    maxUses: row.max_uses,
    oncePerUser: row.once_per_user === 1,
    active: row.active === 1,
    usedCount: usedCount(db, row.id),
  };
}

export function findPromo(db: Db, code: string): PromoRow | undefined {
  return db.get<PromoRow>(`SELECT ${COLUMNS} FROM promo_codes WHERE code = ?`, [
    normalizeCode(code),
  ]);
}

const fail = (code: string, key: string, params?: Record<string, string | number>) =>
  new AppError(400, code, key, params ? { params } : {});

/** Проверяет промокод для клиента на сегодня; бросает ошибку с текстом для RU и RO. */
export function validatePromo(db: Db, clock: Clock, userId: number, code: string): PromoRow {
  const promo = findPromo(db, code);
  if (!promo) throw new AppError(404, 'promo_not_found', 'billing.error.promoNotFound');
  if (promo.active !== 1) throw fail('promo_inactive', 'billing.error.promoInactive');
  const today = clock.localDate();
  if (promo.valid_from && today < promo.valid_from) {
    throw fail('promo_not_started', 'billing.error.promoNotStarted', { date: promo.valid_from });
  }
  if (promo.valid_until && today > promo.valid_until) {
    throw fail('promo_expired', 'billing.error.promoExpired', { date: promo.valid_until });
  }
  if (promo.max_uses !== null && usedCount(db, promo.id) >= promo.max_uses) {
    throw fail('promo_limit', 'billing.error.promoLimit');
  }
  if (promo.once_per_user === 1) {
    const mine = db.get(
      "SELECT 1 AS x FROM promo_redemptions WHERE promo_id = ? AND user_id = ? AND status IN ('reserved', 'redeemed')",
      [promo.id, userId],
    );
    if (mine) throw fail('promo_used', 'billing.error.promoUsed');
  }
  return promo;
}

/** Занимает использование под ещё не оплаченную покупку. */
export function reservePromo(
  db: Db,
  clock: Clock,
  promoId: number,
  userId: number,
  purchaseId: number,
): void {
  const now = clock.now().toISOString();
  db.run(
    `INSERT INTO promo_redemptions (promo_id, user_id, purchase_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'reserved', ?, ?)`,
    [promoId, userId, purchaseId, now, now],
  );
}

/** reserved → redeemed при оплате, reserved → released при отказе. Повтор и чужие статусы не трогает. */
export function settlePromo(
  db: Db,
  clock: Clock,
  purchaseId: number,
  to: 'redeemed' | 'released',
): void {
  db.run(
    `UPDATE promo_redemptions SET status = ?, updated_at = ?
      WHERE purchase_id = ? AND status IN ('reserved', 'released')`,
    [to, clock.now().toISOString(), purchaseId],
  );
}

/**
 * Бесплатные кредиты: проверка и зачисление в одной транзакции, кредиты сразу идут отдельным лотом
 * (цена кредита 0, срок 45 дней). Возвращает число зачисленных кредитов.
 */
export function redeemFreeCredits(ctx: Ctx, userId: number, code: string): number {
  const { db, clock } = ctx;
  return db.tx((tx) => {
    // проверка внутри транзакции: два одновременных запроса не пройдут оба
    const promo = validatePromo(tx, clock, userId, code);
    const now = clock.now().toISOString();
    const { lastInsertRowid } = tx.run(
      `INSERT INTO promo_redemptions (promo_id, user_id, purchase_id, status, created_at, updated_at)
       VALUES (?, ?, NULL, 'redeemed', ?, ?)`,
      [promo.id, userId, now, now],
    );
    const granted = grantLot(
      { db: tx, clock },
      {
        userId,
        source: 'promo',
        credits: promo.value,
        unitPriceBani: 0,
        validityDays: LOT_VALIDITY_DAYS,
        reason: 'purchase',
        memo: `promo:${promo.code}`,
        idemKey: `promo:${Number(lastInsertRowid)}`,
      },
    );
    if (!granted) throw new Error('Повторное зачисление бесплатных кредитов');
    return promo.value;
  });
}

// ---- администрирование ----

export function listPromos(db: Db): PromoDto[] {
  return db
    .query<PromoRow>(`SELECT ${COLUMNS} FROM promo_codes ORDER BY id DESC`)
    .map((row) => toPromoDto(db, row));
}

export function getPromoById(db: Db, id: number): PromoRow | undefined {
  return db.get<PromoRow>(`SELECT ${COLUMNS} FROM promo_codes WHERE id = ?`, [id]);
}

function checkDates(from: string | null, until: string | null): void {
  for (const date of [from, until]) {
    if (date !== null && !isDateISO(date)) {
      throw errors.validation({ validFrom: 'billing.error.promoDates' });
    }
  }
  if (from && until && from > until) {
    throw errors.validation({ validUntil: 'billing.error.promoDates' });
  }
}

export function createPromo(db: Db, clock: Clock, input: PromoCreate): PromoDto {
  const code = normalizeCode(input.code);
  if (findPromo(db, code)) {
    throw new AppError(409, 'promo_code_taken', 'billing.error.promoCodeTaken');
  }
  checkDates(input.validFrom ?? null, input.validUntil ?? null);
  const now = clock.now().toISOString();
  const { lastInsertRowid } = db.run(
    `INSERT INTO promo_codes
       (code, kind, value, owner_label, valid_from, valid_until, max_uses, once_per_user, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.kind,
      input.value,
      input.ownerLabel ?? null,
      input.validFrom ?? null,
      input.validUntil ?? null,
      input.maxUses ?? null,
      input.oncePerUser === false ? 0 : 1,
      input.active === false ? 0 : 1,
      now,
      now,
    ],
  );
  return toPromoDto(db, getPromoById(db, Number(lastInsertRowid))!);
}

export function updatePromo(db: Db, clock: Clock, id: number, patch: PromoUpdate): PromoDto {
  const existing = getPromoById(db, id);
  if (!existing) throw errors.notFound('billing.error.promoNotFound');
  const value = patch.value ?? existing.value;
  const maxUses = patch.maxUses === undefined ? existing.max_uses : patch.maxUses;
  const oncePerUser =
    patch.oncePerUser === undefined ? existing.once_per_user === 1 : patch.oncePerUser;
  // те же правила, что при создании, по итоговым значениям: правка не обходит потолки
  const issues = promoRuleIssues({ kind: existing.kind, value, oncePerUser, maxUses });
  if (issues.length > 0) {
    throw errors.validation(Object.fromEntries(issues.map((i) => [i.path, i.message])));
  }
  const validFrom = patch.validFrom === undefined ? existing.valid_from : patch.validFrom;
  const validUntil = patch.validUntil === undefined ? existing.valid_until : patch.validUntil;
  checkDates(validFrom, validUntil);
  db.run(
    `UPDATE promo_codes SET value = ?, owner_label = ?, valid_from = ?, valid_until = ?,
            max_uses = ?, once_per_user = ?, active = ?, updated_at = ? WHERE id = ?`,
    [
      value,
      patch.ownerLabel === undefined ? existing.owner_label : patch.ownerLabel,
      validFrom,
      validUntil,
      maxUses,
      oncePerUser ? 1 : 0,
      patch.active === undefined ? existing.active : patch.active ? 1 : 0,
      clock.now().toISOString(),
      id,
    ],
  );
  return toPromoDto(db, getPromoById(db, id)!);
}
