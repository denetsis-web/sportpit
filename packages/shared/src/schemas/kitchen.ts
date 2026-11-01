// Схемы API кухни: сводка производства, партии, данные этикетки. Общие для сервера и клиента.
// Сообщения проверки — ключи словаря `kitchen.error.*`.
import { z } from 'zod';
import { isDateISO } from '../time.ts';
import { allergenSchema } from './catalog.ts';

/** Состояния партии: запланирована → производство подтверждено → приготовлена. */
export const BATCH_STATUSES = ['planned', 'confirmed', 'cooked'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const batchStatusSchema = z.enum(BATCH_STATUSES);

/** Допустимые переходы партии; обратно нельзя. */
export const BATCH_TRANSITIONS: Readonly<Record<BatchStatus, readonly BatchStatus[]>> = {
  planned: ['confirmed'],
  confirmed: ['cooked'],
  cooked: [],
};

export const kitchenDateSchema = z.string().refine(isDateISO, 'kitchen.error.date');

export const summaryQuerySchema = z.object({ date: kitchenDateSchema.optional() });

/** Сколько этикеток можно напечатать за раз. */
export const MAX_LABEL_COPIES = 500;

const bilingual = z.object({ ru: z.string(), ro: z.string() });

export const batchSchema = z.object({
  id: z.number().int(),
  /** Читаемый уникальный код: ГГММДД-D<блюдо>-<номер>, например 260311-D07-1. */
  code: z.string(),
  date: z.string(),
  dishId: z.number().int(),
  dishName: bilingual,
  status: batchStatusSchema,
  /** Порции под подтверждённые заказы. */
  plannedQty: z.number().int().nonnegative(),
  /** Запас на брак сверх заказов. */
  bufferQty: z.number().int().nonnegative(),
  /** Сколько готовить: заказы + запас. */
  totalQty: z.number().int().nonnegative(),
  confirmedAt: z.string().nullable(),
  cookedAt: z.string().nullable(),
  /** «Съесть до»: время приготовления плюс срок хранения блюда. */
  eatBy: z.string().nullable(),
});
export type BatchDto = z.infer<typeof batchSchema>;

/** Партия для загрузки холодильника: к общим полям добавлено число порций именно для него. */
export const fridgeBatchSchema = batchSchema.extend({ fridgeQty: z.number().int().positive() });
export type FridgeBatchDto = z.infer<typeof fridgeBatchSchema>;

export const summaryFridgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  gymName: z.string(),
  /** Момент (UTC), после которого заказы на дату не принимаются. */
  cutoffAt: z.string(),
  closed: z.boolean(),
  closedAt: z.string().nullable(),
  /** Порций в заказах на этот холодильник. */
  boxes: z.number().int().nonnegative(),
});

export const summaryDishSchema = z.object({
  dishId: z.number().int(),
  name: bilingual,
  planned: z.number().int().nonnegative(),
  buffer: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  fridges: z.array(z.object({ fridgeId: z.string(), qty: z.number().int().positive() })),
  batch: batchSchema.nullable(),
});

export const productionSummarySchema = z.object({
  date: z.string(),
  /** Приём заказов закрыт во всех холодильниках и список зафиксирован. */
  closed: z.boolean(),
  bufferPercent: z.number(),
  fridges: z.array(summaryFridgeSchema),
  dishes: z.array(summaryDishSchema),
  totals: z.object({
    planned: z.number().int().nonnegative(),
    buffer: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
export type ProductionSummary = z.infer<typeof productionSummarySchema>;

export const batchResponseSchema = z.object({ batch: batchSchema });

/** Размер этикетки из настройки `labelSize` («70x50»), миллиметры. */
export interface LabelSize {
  widthMm: number;
  heightMm: number;
}

export function parseLabelSize(
  value: string,
  fallback: LabelSize = { widthMm: 70, heightMm: 50 },
): LabelSize {
  const match = /^(\d{2,3})x(\d{2,3})$/.exec(value.trim());
  if (!match) return fallback;
  return { widthMm: Number(match[1]), heightMm: Number(match[2]) };
}

export const labelSchema = z.object({
  batchId: z.number().int(),
  code: z.string(),
  date: z.string(),
  /** Сколько этикеток печатать по умолчанию: все порции партии. */
  copies: z.number().int().positive(),
  dish: z.object({
    name: bilingual,
    composition: bilingual,
    calories: z.number(),
    proteinG: z.number(),
    fatG: z.number(),
    carbsG: z.number(),
    weightG: z.number().int(),
    allergens: z.array(allergenSchema),
  }),
  cookedAt: z.string(),
  eatBy: z.string(),
  size: z.object({ widthMm: z.number().int(), heightMm: z.number().int() }),
});
export type LabelData = z.infer<typeof labelSchema>;

/**
 * Приготовлено и списано за период для отчётов: по дате выдачи, блюду и холодильнику.
 * `fridgeId` = null — запас на брак, который не относится ни к одному холодильнику.
 */
export interface CookedTotalRow {
  date: string;
  dishId: number;
  fridgeId: string | null;
  cooked: number;
  writtenOff: number;
}
