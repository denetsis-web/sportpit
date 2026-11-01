// Схемы API трекера питания (модуль tracker): дневные итоги, неделя, ручные записи.
// Сообщения проверки — ключи словаря `tracker.error.*`.
import { z } from 'zod';
import { addDaysISO, isDateISO } from '../time.ts';

const dateSchema = z.string().refine(isDateISO, 'tracker.error.date');

const number = (max: number) =>
  z.number('tracker.error.number').min(0, 'tracker.error.number').max(max, 'tracker.error.number');

export const MAX_ENTRY_NAME = 100;
export const MAX_ENTRY_KCAL = 10000;
export const MAX_ENTRY_GRAMS = 1000;

/** Ручная запись: название и калории обязательны, остальное по умолчанию 0. Отрицательные числа отклоняются. */
export const entryInputSchema = z.object({
  date: dateSchema,
  name: z.string().trim().min(1, 'tracker.error.name').max(MAX_ENTRY_NAME, 'tracker.error.name'),
  calories: number(MAX_ENTRY_KCAL),
  proteinG: number(MAX_ENTRY_GRAMS).default(0),
  fatG: number(MAX_ENTRY_GRAMS).default(0),
  carbsG: number(MAX_ENTRY_GRAMS).default(0),
  fiberG: number(MAX_ENTRY_GRAMS).default(0),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

/** Правка записи: любое подмножество полей. */
export const entryPatchSchema = z
  .object({
    date: dateSchema,
    name: z.string().trim().min(1, 'tracker.error.name').max(MAX_ENTRY_NAME, 'tracker.error.name'),
    calories: number(MAX_ENTRY_KCAL),
    proteinG: number(MAX_ENTRY_GRAMS),
    fatG: number(MAX_ENTRY_GRAMS),
    carbsG: number(MAX_ENTRY_GRAMS),
    fiberG: number(MAX_ENTRY_GRAMS),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'tracker.error.empty');
export type EntryPatch = z.infer<typeof entryPatchSchema>;

export const dayQuerySchema = z.object({ date: dateSchema.optional() });

export const nutritionSchema = z.object({
  calories: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fiberG: z.number(),
});
export type Nutrition = z.infer<typeof nutritionSchema>;

export const NUTRITION_KEYS = ['calories', 'proteinG', 'fatG', 'carbsG', 'fiberG'] as const;

export const trackerEntrySchema = nutritionSchema.extend({
  id: z.number().int(),
  date: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
export type TrackerEntryDto = z.infer<typeof trackerEntrySchema>;

export const entryResponseSchema = z.object({ entry: trackerEntrySchema });

/** Выданный бокс дня: итоги по заказу (порция × количество). */
export const trackerBoxSchema = nutritionSchema.extend({
  orderId: z.string(),
  items: z.array(
    z.object({
      dishId: z.number().int(),
      name: z.object({ ru: z.string(), ro: z.string() }),
      qty: z.number().int(),
    }),
  ),
});
export type TrackerBoxDto = z.infer<typeof trackerBoxSchema>;

/** Цель дня из анкеты; `null`, если анкеты нет или норма не рассчитывается. */
export const trackerTargetSchema = nutritionSchema;

export const trackerDaySchema = z.object({
  date: z.string(),
  today: z.string(),
  total: nutritionSchema,
  boxes: z.array(trackerBoxSchema),
  entries: z.array(trackerEntrySchema),
  target: trackerTargetSchema.nullable(),
  /** Норма не рассчитывается (состояние здоровья, возраст): показываем «Обратитесь к врачу». */
  targetBlocked: z.boolean(),
  /** Нет ни выданных боксов, ни записей. */
  empty: z.boolean(),
});
export type TrackerDayDto = z.infer<typeof trackerDaySchema>;

export const trackerWeekDaySchema = z.object({
  date: z.string(),
  total: nutritionSchema,
  boxes: z.number().int(),
  entries: z.number().int(),
});

export const trackerWeekSchema = z.object({
  from: z.string(),
  to: z.string(),
  today: z.string(),
  days: z.array(trackerWeekDaySchema).length(7),
  target: trackerTargetSchema.nullable(),
  targetBlocked: z.boolean(),
  empty: z.boolean(),
});
export type TrackerWeekDto = z.infer<typeof trackerWeekSchema>;

/** Понедельник недели, в которую попадает дата (недели с понедельника по воскресенье). */
export function weekStart(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 — воскресенье
  return addDaysISO(dateISO, -((weekday + 6) % 7));
}
