// Схемы API пакетов, оплаты, кредитов, промокодов и возвратов (модуль billing).
// Общие для сервера и клиента. Деньги — целые бани, время — ISO 8601 (UTC).
import { z } from 'zod';

/** Срок жизни лота: 45 дней с покупки. */
export const LOT_VALIDITY_DAYS = 45;
/** За сколько дней до сгорания приходит уведомление. */
export const EXPIRY_NOTICE_DAYS = 7;
/** Сколько кредитов переносится из недавно истёкших лотов при покупке нового пакета. */
export const CARRYOVER_MAX = 4;
/** За какой срок после истечения лота его кредиты ещё можно перенести. */
export const CARRYOVER_WINDOW_DAYS = 45;
/** Сколько минут покупка ждёт оплату, потом считается неоплаченной. */
export const PENDING_TTL_MINUTES = 30;

export const PAYMENT_METHODS = ['card', 'mia'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const PURCHASE_STATUSES = ['pending', 'paid', 'failed'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const FAILURE_CODES = ['declined', 'cancelled', 'expired', 'error'] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export const PROMO_KINDS = ['percent', 'fixed', 'free_credits'] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];
export const promoKindSchema = z.enum(PROMO_KINDS);

const bani = z.number().int().nonnegative();

// ---- пакеты ----

export const packageSchema = z.object({
  id: z.number().int(),
  boxes: z.number().int().positive(),
  pricePerBoxBani: z.number().int().positive(),
  totalBani: z.number().int().positive(),
  validityDays: z.number().int().positive(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type PackageDto = z.infer<typeof packageSchema>;

export const packagesResponseSchema = z.object({ items: z.array(packageSchema) });

/** Цена за бокс в банях: от 1 бани до 100 000 лей. */
const pricePerBox = z.number().int().min(1).max(10_000_000);

export const packageCreateSchema = z.object({
  boxes: z.number().int().min(1).max(1000),
  pricePerBoxBani: pricePerBox,
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});
export type PackageCreate = z.infer<typeof packageCreateSchema>;

export const packageUpdateSchema = z
  .object({
    boxes: z.number().int().min(1).max(1000),
    pricePerBoxBani: pricePerBox,
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'core.error.validation' });
export type PackageUpdate = z.infer<typeof packageUpdateSchema>;

export const packageResponseSchema = z.object({ package: packageSchema });

// ---- баланс и лоты ----

export const lotSchema = z.object({
  id: z.number().int(),
  source: z.enum(['purchase', 'promo', 'carryover', 'complaint']),
  remaining: z.number().int().positive(),
  unitPriceBani: bani,
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type LotDto = z.infer<typeof lotSchema>;

export const balanceResponseSchema = z.object({
  /** Доступные кредиты: зарезервированные под заказы сюда не входят. */
  balance: z.number().int().nonnegative(),
  lots: z.array(lotSchema),
});
export type BalanceResponse = z.infer<typeof balanceResponseSchema>;

// ---- покупки ----

export const purchaseCreateSchema = z.object({
  packageId: z.number().int().positive(),
  method: paymentMethodSchema,
  promoCode: z.string().trim().min(1).max(40).optional(),
  /** Ключ попытки: двойное нажатие шлёт тот же ключ и получает ту же покупку. */
  idempotencyKey: z.string().trim().min(8).max(100),
});
export type PurchaseCreate = z.infer<typeof purchaseCreateSchema>;

export const purchaseSchema = z.object({
  id: z.number().int(),
  status: z.enum(PURCHASE_STATUSES),
  failureCode: z.enum(FAILURE_CODES).nullable(),
  /** Причина от платёжного шлюза «как есть»; может быть пустой. */
  failureReason: z.string().nullable(),
  packageId: z.number().int(),
  boxes: z.number().int().positive(),
  listPricePerBoxBani: z.number().int().positive(),
  unitPriceBani: bani,
  discountBani: bani,
  totalBani: bani,
  promoCode: z.string().nullable(),
  method: paymentMethodSchema,
  /** Куда отправить клиента для оплаты; пусто, если платить уже не нужно. */
  redirectUrl: z.string().nullable(),
  /** Работает заглушка шлюза: страница оплаты покажет кнопки «Оплатить» и «Отклонить». */
  stubGateway: z.boolean(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  /** До какого момента действуют кредиты (после оплаты). */
  expiresAt: z.string().nullable(),
  /** Сколько кредитов перенесено из истёкших лотов при этой покупке. */
  carriedOver: z.number().int().nonnegative(),
});
export type PurchaseDto = z.infer<typeof purchaseSchema>;

export const purchaseResponseSchema = z.object({ purchase: purchaseSchema });
export const purchasesResponseSchema = z.object({ items: z.array(purchaseSchema) });

export const stubPaySchema = z.object({ outcome: z.enum(['paid', 'failed']) });
export type StubPay = z.infer<typeof stubPaySchema>;

// ---- промокоды ----

export const promoApplySchema = z.object({
  code: z.string().trim().min(1).max(40),
  packageId: z.number().int().positive().optional(),
});
export type PromoApply = z.infer<typeof promoApplySchema>;

export const promoApplyResponseSchema = z.object({
  code: z.string(),
  kind: promoKindSchema,
  /** Для процента и суммы — скидка на выбранный пакет; для бесплатных кредитов 0. */
  discountBani: bani,
  /** Итог к оплате за пакет со скидкой (если пакет выбран). */
  totalBani: bani.nullable(),
  unitPriceBani: bani.nullable(),
  /** Для бесплатных кредитов — сколько зачислено прямо сейчас. */
  creditsGranted: z.number().int().nonnegative(),
});
export type PromoApplyResponse = z.infer<typeof promoApplyResponseSchema>;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'core.error.validation');

export const promoSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  kind: promoKindSchema,
  value: z.number().int().positive(),
  ownerLabel: z.string().nullable(),
  validFrom: dateOnly.nullable(),
  validUntil: dateOnly.nullable(),
  maxUses: z.number().int().positive().nullable(),
  oncePerUser: z.boolean(),
  active: z.boolean(),
  /** Сколько раз применён (оплаченные и ожидающие оплаты покупки). */
  usedCount: z.number().int().nonnegative(),
});
export type PromoDto = z.infer<typeof promoSchema>;

export const promosResponseSchema = z.object({ items: z.array(promoSchema) });
export const promoResponseSchema = z.object({ promo: promoSchema });

/** Больше бесплатных кредитов одним промокодом не выдаём: защита от опечатки в админке. */
export const PROMO_MAX_FREE_CREDITS = 100;

export const promoCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'billing.error.promoCodeFormat')
      .max(40, 'billing.error.promoCodeFormat')
      .regex(/^[A-Za-z0-9_-]+$/, 'billing.error.promoCodeFormat'),
    kind: promoKindSchema,
    /** Процент (1–100), сумма в банях или число бесплатных кредитов. */
    value: z.number().int().positive().max(10_000_000),
    ownerLabel: z.string().trim().max(80).nullable().optional(),
    validFrom: dateOnly.nullable().optional(),
    validUntil: dateOnly.nullable().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    oncePerUser: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((promo, ctx) => {
    if (promo.kind === 'percent' && promo.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'billing.error.promoValue' });
    }
    if (promo.kind === 'free_credits' && promo.value > PROMO_MAX_FREE_CREDITS) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'billing.error.promoValue' });
    }
    if (promo.validFrom && promo.validUntil && promo.validFrom > promo.validUntil) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'billing.error.promoDates' });
    }
  });
export type PromoCreate = z.infer<typeof promoCreateSchema>;

export const promoUpdateSchema = z
  .object({
    value: z.number().int().positive().max(10_000_000),
    ownerLabel: z.string().trim().max(80).nullable(),
    validFrom: dateOnly.nullable(),
    validUntil: dateOnly.nullable(),
    maxUses: z.number().int().positive().nullable(),
    oncePerUser: z.boolean(),
    active: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'core.error.validation' });
export type PromoUpdate = z.infer<typeof promoUpdateSchema>;

// ---- возвраты ----

export const refundCreateSchema = z.object({
  purchaseId: z.number().int().positive(),
  /** Сколько кредитов вернуть; не задано — все неиспользованные. */
  credits: z.number().int().positive().optional(),
  reason: z
    .string()
    .trim()
    .min(3, 'billing.error.refundReason')
    .max(300, 'billing.error.refundReason'),
});
export type RefundCreate = z.infer<typeof refundCreateSchema>;

export const refundSchema = z.object({
  id: z.number().int(),
  purchaseId: z.number().int(),
  userId: z.number().int(),
  userPhone: z.string().nullable(),
  credits: z.number().int().positive(),
  amountBani: z.number().int().positive(),
  reason: z.string(),
  status: z.enum(['pending', 'done', 'failed']),
  failureDetail: z.string().nullable(),
  createdAt: z.string(),
});
export type RefundDto = z.infer<typeof refundSchema>;

export const refundResponseSchema = z.object({ refund: refundSchema });
export const refundsResponseSchema = z.object({ items: z.array(refundSchema) });

export const adminPurchaseSchema = purchaseSchema.extend({
  userId: z.number().int(),
  userPhone: z.string().nullable(),
  /** Неиспользованные кредиты лота покупки (без зарезервированных). */
  unusedCredits: z.number().int().nonnegative(),
  refundableBani: bani,
  refundedBani: bani,
});
export type AdminPurchaseDto = z.infer<typeof adminPurchaseSchema>;

export const adminPurchasesResponseSchema = z.object({ items: z.array(adminPurchaseSchema) });

// ---- история кредитов клиента ----

export const ledgerEntrySchema = z.object({
  id: z.number().int(),
  reason: z.enum([
    'purchase',
    'reserve',
    'release',
    'consume',
    'expire',
    'carryover',
    'refund',
    'complaint_credit',
    'adjustment',
  ]),
  delta: z.number().int(),
  createdAt: z.string(),
});
export type LedgerEntryDto = z.infer<typeof ledgerEntrySchema>;
export const ledgerResponseSchema = z.object({
  balance: z.number().int().nonnegative(),
  items: z.array(ledgerEntrySchema),
});
