// Схемы API заказов (модуль orders) и перечисление статусов заказа.
// Сообщения проверки — ключи словаря `orders.error.*`.
import { z } from 'zod';
import { isDateISO } from '../time.ts';
import { ENTITY_ID_PATTERN } from './admin.ts';

// ---- статусы (контракт для задач кухни, выдачи и отчётов) ----

/** Статусы заказа: подтверждён → загружен в холодильник → выдан; отменён или списан. */
export const ORDER_STATUSES = [
  'confirmed',
  'cancelled',
  'loaded',
  'picked_up',
  'written_off',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

/** Допустимые переходы: confirmed→loaded→picked_up, confirmed|loaded→written_off, confirmed→cancelled. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  confirmed: ['loaded', 'written_off', 'cancelled'],
  loaded: ['picked_up', 'written_off'],
  picked_up: [],
  written_off: [],
  cancelled: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_TRANSITIONS[from].includes(to);

/** Статусы, в которых заказ занимает порции блюд и места в холодильнике. */
export const OCCUPYING_STATUSES = ['confirmed', 'loaded', 'picked_up', 'written_off'] as const;
/** Статусы, в которых бокс ещё предстоит выдать (по ним кухня считает производство). */
export const OPEN_STATUSES = ['confirmed', 'loaded'] as const;

export const ORDER_CODE_LENGTH = 4;
/** Блюд в одном заказе (разных) и порций одного блюда. */
export const MAX_ORDER_ITEMS = 10;
export const MAX_ITEM_QTY = 10;
/** Пауза пакета: не больше 14 дней, один раз на пакет (лот). */
export const PAUSE_MAX_DAYS = 14;

// ---- запросы ----

const fridgeIdSchema = z.string().trim().regex(ENTITY_ID_PATTERN, 'orders.error.fridge');
const dateSchema = z.string().refine(isDateISO, 'orders.error.date');

export const orderItemInputSchema = z.object({
  dishId: z.number().int('orders.error.dish').positive('orders.error.dish'),
  qty: z
    .number()
    .int('orders.error.qty')
    .min(1, 'orders.error.qty')
    .max(MAX_ITEM_QTY, 'orders.error.qty'),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

/** Подтверждение заказа. Ключ идемпотентности: повтор с тем же ключом не создаёт второй заказ. */
export const confirmOrderSchema = z.object({
  fridgeId: fridgeIdSchema,
  date: dateSchema,
  items: z
    .array(orderItemInputSchema)
    .min(1, 'orders.error.empty')
    .max(MAX_ORDER_ITEMS, 'orders.error.empty'),
  idempotencyKey: z.string().trim().min(8, 'orders.error.key').max(100, 'orders.error.key'),
});
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;

/** Перенос: отмена прежнего заказа и новый заказ одним действием. */
export const moveOrderSchema = confirmOrderSchema;
export type MoveOrderInput = ConfirmOrderInput;

export const availabilityQuerySchema = z.object({ fridgeId: fridgeIdSchema, date: dateSchema });

export const pauseCreateSchema = z.object({
  lotId: z.number().int('orders.error.pauseLot').positive('orders.error.pauseLot'),
  from: dateSchema,
  days: z
    .number()
    .int('orders.error.pauseDays')
    .min(1, 'orders.error.pauseDays')
    .max(PAUSE_MAX_DAYS, 'orders.error.pauseDays'),
});
export type PauseCreate = z.infer<typeof pauseCreateSchema>;

// ---- ответы ----

const bilingual = z.object({ ru: z.string(), ro: z.string() });

/** Позиция заказа: блюдо на момент заказа (названия и КБЖУ одной порции сохранены в заказе). */
export const orderItemSchema = z.object({
  dishId: z.number().int(),
  qty: z.number().int().positive(),
  name: bilingual,
  calories: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fiberG: z.number(),
});
export type OrderItemDto = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  /** День выдачи. */
  date: z.string(),
  fridgeId: z.string(),
  fridgeName: z.string(),
  gymName: z.string(),
  /** Код получения из 4 цифр; у отменённого заказа его нет. */
  code: z.string().nullable(),
  boxes: z.number().int().positive(),
  items: z.array(orderItemSchema),
  createdAt: z.string(),
  /** Момент UTC, до которого заказ можно отменить или перенести. */
  cutoffAt: z.string(),
  /** Заказ подтверждён и срок ещё не вышел: можно отменить и перенести. */
  canChange: z.boolean(),
  pickupFrom: z.string(),
  pickupTo: z.string(),
});
export type OrderDto = z.infer<typeof orderSchema>;

export const orderResponseSchema = z.object({ order: orderSchema });
/** Ответ на подтверждение: `firstOrder` — это первый заказ клиента (пора предложить установить приложение). */
export const confirmedResponseSchema = z.object({ order: orderSchema, firstOrder: z.boolean() });
export const moveResponseSchema = z.object({ order: orderSchema, cancelledId: z.string() });
export const ordersListSchema = z.object({
  upcoming: z.array(orderSchema),
  past: z.array(orderSchema),
});
export type OrdersList = z.infer<typeof ordersListSchema>;

export const CLOSED_REASONS = ['date', 'cutoff', 'paused'] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

/** Что можно заказать в холодильнике на день: срок, свободные места и лимит клиента. */
export const availabilitySchema = z.object({
  fridgeId: z.string(),
  date: z.string(),
  capacityBoxes: z.number().int(),
  /** Свободно боксов; 0 — «Мест нет». */
  boxesLeft: z.number().int().nonnegative(),
  cutoffTime: z.string(),
  cutoffAt: z.string(),
  /** Приём закрыт: `date` — день не в будущем, `cutoff` — срок вышел, `paused` — на день стоит пауза. */
  closedReason: z.enum(CLOSED_REASONS).nullable(),
  maxBoxesPerDay: z.number().int(),
  /** Сколько боксов у клиента уже заказано на этот день. */
  userBoxes: z.number().int().nonnegative(),
});
export type Availability = z.infer<typeof availabilitySchema>;

export const pauseSchema = z.object({
  lotId: z.number().int(),
  /** Первый и последний день паузы. */
  from: z.string(),
  until: z.string(),
  days: z.number().int(),
  /** Срок лота после сдвига и до него (момент UTC). */
  expiresAt: z.string(),
  previousExpiresAt: z.string(),
});
export type PauseDto = z.infer<typeof pauseSchema>;
export const pauseResponseSchema = z.object({ pause: pauseSchema });
export const pausesResponseSchema = z.object({ items: z.array(pauseSchema) });
