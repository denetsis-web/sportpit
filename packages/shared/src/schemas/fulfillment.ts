// Схемы API выдачи (модуль fulfillment): загрузка холодильника, получение бокса, закрытие дня,
// списания и температура. Общие для сервера и клиента. Сообщения проверки — ключи `fulfillment.error.*`.
import { z } from 'zod';
import { isDateISO } from '../time.ts';
import { ENTITY_ID_PATTERN } from './admin.ts';
import { orderStatusSchema } from './orders.ts';
import { WRITE_OFF_REASONS } from '../types.ts';

// ---- температура (R34.1) ----

/** Два замера в день. */
export const TEMPERATURE_SLOTS = ['morning', 'evening'] as const;
export type TemperatureSlot = (typeof TEMPERATURE_SLOTS)[number];
export const temperatureSlotSchema = z.enum(TEMPERATURE_SLOTS, 'fulfillment.error.slot');

/** Допустимый диапазон холодильника, °C (включительно): вне него замер подсвечивается и пишется в события. */
export const TEMPERATURE_MIN_C = 0;
export const TEMPERATURE_MAX_C = 5;
/** Что можно ввести вообще (защита от опечатки вроде 40). */
export const TEMPERATURE_INPUT_MIN_C = -40;
export const TEMPERATURE_INPUT_MAX_C = 60;
/**
 * Срок замера: пока он не наступил, отсутствие записи пропуском не считается.
 * Технические значения по умолчанию (время по Кишинёву), не условия владельца.
 */
export const TEMPERATURE_DEADLINES: Readonly<Record<TemperatureSlot, string>> = {
  morning: '12:00',
  evening: '22:00',
};
/** Сколько прошедших дней смотрит список пропусков по умолчанию и не больше. */
export const MISSED_DEFAULT_DAYS = 7;
export const MISSED_MAX_DAYS = 31;

export const isOutOfRange = (celsius: number): boolean =>
  celsius < TEMPERATURE_MIN_C || celsius > TEMPERATURE_MAX_C;

// ---- запросы ----

const dateSchema = z.string().refine(isDateISO, 'fulfillment.error.date');
const fridgeIdSchema = z.string().trim().regex(ENTITY_ID_PATTERN, 'fulfillment.error.fridge');
const writeOffReasonSchema = z.enum(WRITE_OFF_REASONS, 'fulfillment.error.reason');

export const fridgeParamsSchema = z.object({ id: fridgeIdSchema });
export const dayQuerySchema = z.object({ date: dateSchema.optional() });

export const loadBodySchema = z.object({ date: dateSchema });
export type LoadBody = z.infer<typeof loadBodySchema>;

export const PICKUP_CODE_PATTERN = /^\d{4}$/;
export const pickupByCodeSchema = z.object({
  date: dateSchema,
  code: z.string().trim().regex(PICKUP_CODE_PATTERN, 'fulfillment.error.codeFormat'),
});
export type PickupByCodeBody = z.infer<typeof pickupByCodeSchema>;

const qtySchema = z
  .number('fulfillment.error.qty')
  .int('fulfillment.error.qty')
  .min(1, 'fulfillment.error.qty')
  .max(999, 'fulfillment.error.qty');

/** Лишний бокс, у которого нет заказа: списывается отдельной строкой. */
export const extraWriteOffSchema = z.object({
  dishId: z.number('fulfillment.error.dish').int('fulfillment.error.dish').positive().nullable(),
  qty: qtySchema,
  reason: writeOffReasonSchema,
});
export type ExtraWriteOff = z.infer<typeof extraWriteOffSchema>;

/**
 * Закрытие дня по холодильнику: фактический остаток боксов, причина для невыданных заказов
 * (по умолчанию «не забрали»), исключения по отдельным заказам и распределение лишних боксов.
 */
export const closeDaySchema = z.object({
  date: dateSchema,
  remaining: z
    .number('fulfillment.error.remaining')
    .int('fulfillment.error.remaining')
    .min(0, 'fulfillment.error.remaining')
    .max(9999, 'fulfillment.error.remaining'),
  reason: writeOffReasonSchema.default('not_picked_up'),
  orders: z
    .array(z.object({ orderId: z.string().trim().min(1).max(64), reason: writeOffReasonSchema }))
    .max(500)
    .optional(),
  extras: z.array(extraWriteOffSchema).max(50).optional(),
});
export type CloseDayBody = z.infer<typeof closeDaySchema>;

export const temperatureBodySchema = z.object({
  slot: temperatureSlotSchema,
  celsius: z
    .number('fulfillment.error.celsius')
    .min(TEMPERATURE_INPUT_MIN_C, 'fulfillment.error.celsius')
    .max(TEMPERATURE_INPUT_MAX_C, 'fulfillment.error.celsius'),
});
export type TemperatureBody = z.infer<typeof temperatureBodySchema>;

export const rangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

// ---- ответы: оператор ----

const bilingual = z.object({ ru: z.string(), ro: z.string() });

export const operatorFridgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  gymName: z.string(),
  pickupFrom: z.string(),
  pickupTo: z.string(),
});
export type OperatorFridgeDto = z.infer<typeof operatorFridgeSchema>;
export const operatorFridgesSchema = z.object({ items: z.array(operatorFridgeSchema) });

export const loadItemSchema = z.object({
  dishId: z.number().int(),
  name: bilingual,
  /** Сколько боксов этого блюда положить. */
  qty: z.number().int().positive(),
  /** Партия блюда на эту дату: код и состояние; нет партии — кухня ещё не закрыла приём. */
  batch: z.object({ id: z.number().int(), code: z.string(), status: z.string() }).nullable(),
  cooked: z.boolean(),
});
export type LoadItemDto = z.infer<typeof loadItemSchema>;

export const dayOrderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  boxes: z.number().int().positive(),
  items: z.array(z.object({ dishId: z.number().int(), qty: z.number().int(), name: bilingual })),
});

export const temperatureEntrySchema = z.object({
  fridgeId: z.string(),
  date: z.string(),
  slot: temperatureSlotSchema,
  celsius: z.number(),
  outOfRange: z.boolean(),
  recordedAt: z.string(),
});
export type TemperatureEntryDto = z.infer<typeof temperatureEntrySchema>;

export const closureSchema = z.object({
  closedAt: z.string(),
  source: z.enum(['operator', 'system']),
  /** Фактический остаток, который назвал оператор; при автозакрытии неизвестен. */
  remaining: z.number().int().nullable(),
  writtenOffOrders: z.number().int().nonnegative(),
  writtenOffExtra: z.number().int().nonnegative(),
});
export type ClosureDto = z.infer<typeof closureSchema>;

export const dayOverviewSchema = z.object({
  fridge: operatorFridgeSchema,
  date: z.string(),
  today: z.string(),
  /** Приём заказов на дату закрыт: можно загружать. */
  cutoffPassed: z.boolean(),
  loaded: z.boolean(),
  loadedAt: z.string().nullable(),
  items: z.array(loadItemSchema),
  /** Блюда, партии которых ещё не приготовлены: пока они есть, «загружено» не отметить. */
  blockedDishes: z.array(z.string()),
  orders: z.array(dayOrderSchema),
  totals: z.object({
    boxes: z.number().int().nonnegative(),
    pickedUp: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
    writtenOff: z.number().int().nonnegative(),
  }),
  closure: closureSchema.nullable(),
  temperature: z.object({
    morning: temperatureEntrySchema.nullable(),
    evening: temperatureEntrySchema.nullable(),
  }),
});
export type DayOverview = z.infer<typeof dayOverviewSchema>;

export const loadedResponseSchema = z.object({
  loaded: z.boolean(),
  loadedAt: z.string(),
  orders: z.number().int().nonnegative(),
});

export const pickupResultSchema = z.object({
  orderId: z.string(),
  status: orderStatusSchema,
  /** Заказ уже был выдан раньше: повтор ничего не изменил. */
  alreadyPickedUp: z.boolean(),
  boxes: z.number().int().positive(),
  items: z.array(z.object({ dishId: z.number().int(), qty: z.number().int(), name: bilingual })),
});
export type PickupResult = z.infer<typeof pickupResultSchema>;

export const closeDayResultSchema = z.object({
  date: z.string(),
  fridgeId: z.string(),
  alreadyClosed: z.boolean(),
  closure: closureSchema,
});
export type CloseDayResult = z.infer<typeof closeDayResultSchema>;

export const temperatureListSchema = z.object({ items: z.array(temperatureEntrySchema) });
export const temperatureResponseSchema = z.object({ entry: temperatureEntrySchema });

// ---- ответы: администратор (пропуски температуры) ----

export const missedTemperatureSchema = z.object({
  fridgeId: z.string(),
  fridgeName: z.string(),
  gymName: z.string(),
  date: z.string(),
  slot: temperatureSlotSchema,
});
export type MissedTemperature = z.infer<typeof missedTemperatureSchema>;
export const missedListSchema = z.object({
  from: z.string(),
  to: z.string(),
  items: z.array(missedTemperatureSchema),
});

/** Строка списаний для отчётов: по заказам (блюдо из заказа) и без заказов (`dishId` может быть null). */
export interface WriteOffTotalRow {
  date: string;
  fridgeId: string;
  dishId: number | null;
  reason: (typeof WRITE_OFF_REASONS)[number];
  qty: number;
}

// ---- ответы: клиент ----

export const PICKUP_BLOCKED_REASONS = [
  'not_today',
  'not_loaded',
  'before_window',
  'after_window',
  'picked_up',
  'written_off',
  'cancelled',
] as const;
export type PickupBlockedReason = (typeof PICKUP_BLOCKED_REASONS)[number];

export const pickupViewSchema = z.object({
  orderId: z.string(),
  status: orderStatusSchema,
  date: z.string(),
  fridgeId: z.string(),
  fridgeName: z.string(),
  gymName: z.string(),
  pickupFrom: z.string(),
  pickupTo: z.string(),
  /** Код получения; у отменённого заказа его нет. */
  code: z.string().nullable(),
  boxes: z.number().int().positive(),
  items: z.array(z.object({ dishId: z.number().int(), qty: z.number().int(), name: bilingual })),
  /** Оператор отметил загрузку холодильника. */
  loaded: z.boolean(),
  /** Кнопка «Забрал» доступна: загружено, сегодня, идёт окно выдачи. */
  canPickup: z.boolean(),
  blockedReason: z.enum(PICKUP_BLOCKED_REASONS).nullable(),
  /** Код замка: только после загрузки, в день заказа и в окно выдачи, если он задан. */
  accessCode: z.string().nullable(),
});
export type PickupView = z.infer<typeof pickupViewSchema>;
export const pickupListSchema = z.object({ items: z.array(pickupViewSchema) });
export const pickupViewResponseSchema = z.object({ order: pickupViewSchema });
export const clientPickupResultSchema = z.object({
  order: pickupViewSchema,
  alreadyPickedUp: z.boolean(),
});
