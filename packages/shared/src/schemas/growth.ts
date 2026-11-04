// Схемы API листа ожидания, событий лендинга и воронки (модуль growth). Общие для сервера и клиента.
// Сообщения проверки — ключи словаря `growth.error.*` или `auth.error.*`. Персональные данные и их хранение — ADR 0010.
import { z } from 'zod';
import { isDateISO } from '../time.ts';
import { attributionSchema, ATTRIBUTION_SOURCES, langSchema, phoneSchema } from './auth.ts';
import { goalSchema } from './catalog.ts';

export { ATTRIBUTION_SOURCES, attributionSchema } from './auth.ts';
export type { Attribution, AttributionSource } from './auth.ts';

/**
 * Версия текста согласия на лист ожидания. Записывается в строку вместе со временем согласия.
 * После правки текста у юриста поднимите дату.
 */
export const WAITLIST_CONSENT_VERSION = '2026-11-04';

/** Записей на странице списка листа ожидания. */
export const WAITLIST_PAGE_SIZE = 50;

/** События, которые лендинг присылает сам; `waitlist_join` и `signup` пишет сервер. */
export const TRACK_KINDS = ['landing_view', 'calc_used'] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

export const trackEventSchema = z.object({
  kind: z.enum(TRACK_KINDS),
  attribution: attributionSchema,
});
export type TrackEvent = z.infer<typeof trackEventSchema>;

// ---- лист ожидания: приём записи ----

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const waitlistJoinSchema = z.object({
  phone: phoneSchema,
  name: optionalText(60),
  /** Зал или район: свободный текст. */
  gym: optionalText(80),
  goal: goalSchema.optional(),
  lang: langSchema,
  /** Галочка согласия обязательна и не отмечена заранее. */
  consent: z.literal(true, 'growth.error.consent'),
  /** Скрытое поле-приманка: заполняют только боты. */
  website: z.string().optional(),
  attribution: attributionSchema.optional(),
});
export type WaitlistJoin = z.infer<typeof waitlistJoinSchema>;

export const waitlistJoinResponseSchema = z.object({ ok: z.literal(true) });
export type WaitlistJoinResponse = z.infer<typeof waitlistJoinResponseSchema>;

// ---- лист ожидания: список администратора ----

/** Отметки пути человека (по анонимному номеру); `null` у записи без номера. */
export const waitlistPathSchema = z.object({
  usedCalc: z.boolean(),
  signedUp: z.boolean(),
  purchased: z.boolean(),
});
export type WaitlistPath = z.infer<typeof waitlistPathSchema>;

export const waitlistEntrySchema = z.object({
  id: z.number().int(),
  phone: z.string(),
  name: z.string().nullable(),
  gym: z.string().nullable(),
  goal: goalSchema.nullable(),
  lang: langSchema,
  source: z.enum(ATTRIBUTION_SOURCES),
  ref: z.string().nullable(),
  campaign: z.string().nullable(),
  createdAt: z.string(),
  path: waitlistPathSchema.nullable(),
});
export type WaitlistEntryDto = z.infer<typeof waitlistEntrySchema>;

const dateParam = z.string().refine(isDateISO, 'growth.error.date');

/** Пустое значение в запросе (`?q=`) считается отсутствующим: так форма фильтров не ломает запрос. */
const blankAsMissing = <S extends z.ZodType>(schema: S) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const waitlistListQuerySchema = z.object({
  /** Часть номера или имени. */
  q: blankAsMissing(z.string().trim().max(80)),
  /** Часть названия зала или района. */
  gym: blankAsMissing(z.string().trim().max(80)),
  goal: blankAsMissing(goalSchema),
  lang: blankAsMissing(langSchema),
  source: blankAsMissing(z.enum(ATTRIBUTION_SOURCES)),
  /** Период по дню записи (Кишинёв), обе границы включительно. */
  from: blankAsMissing(dateParam),
  to: blankAsMissing(dateParam),
  page: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce
      .number('growth.error.page')
      .int('growth.error.page')
      .min(1, 'growth.error.page')
      .max(100000, 'growth.error.page')
      .default(1),
  ),
});
export type WaitlistListQuery = z.infer<typeof waitlistListQuerySchema>;

export const waitlistListSchema = z.object({
  items: z.array(waitlistEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type WaitlistList = z.infer<typeof waitlistListSchema>;

/** Запрос CSV: те же фильтры без страницы; `labels` — язык заголовков столбцов (по умолчанию из Accept-Language). */
export const waitlistCsvQuerySchema = waitlistListQuerySchema
  .omit({ page: true })
  .extend({ labels: blankAsMissing(langSchema) });
export type WaitlistCsvQuery = z.infer<typeof waitlistCsvQuerySchema>;

// ---- воронка ----

export const funnelQuerySchema = z.object({
  from: blankAsMissing(dateParam),
  to: blankAsMissing(dateParam),
});
export type FunnelQuery = z.infer<typeof funnelQuerySchema>;

/** Сколько разных анонимных номеров дошло до этапа (только согласившиеся на аналитику). */
export const funnelUniqueSchema = z.object({
  visitors: z.number().int(),
  calc: z.number().int(),
  waitlist: z.number().int(),
  signups: z.number().int(),
  purchases: z.number().int(),
});
export type FunnelUnique = z.infer<typeof funnelUniqueSchema>;

export const funnelRowSchema = z.object({
  source: z.union([z.enum(ATTRIBUTION_SOURCES), z.literal('total')]),
  landingViews: z.number().int(),
  calcUsed: z.number().int(),
  waitlistJoins: z.number().int(),
  signups: z.number().int(),
  firstPurchases: z.number().int(),
  unique: funnelUniqueSchema,
});
export type FunnelRow = z.infer<typeof funnelRowSchema>;

/** Строки по всем источникам в порядке `ATTRIBUTION_SOURCES`, последняя — `total`. */
export const funnelReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  rows: z.array(funnelRowSchema),
});
export type FunnelReport = z.infer<typeof funnelReportSchema>;
