// Схемы API отчётов и страницы «События системы» (модуль reports). Общие для сервера и клиента.
// Сообщения проверки — ключи словаря `reports.error.*`. Деньги — целые бани.
import { z } from 'zod';
import { WRITE_OFF_REASONS } from '../types.ts';
import { isDateISO } from '../time.ts';

/** Виды отчётов: продажи, выдано и списано, рейтинг блюд, доля зала, активные клиенты и отток. */
export const REPORT_KINDS = ['sales', 'waste', 'ratings', 'share', 'retention'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const reportKindSchema = z.enum(REPORT_KINDS, 'reports.error.kind');

/** Строк на странице таблицы. */
export const REPORT_PAGE_SIZE = 50;
/** Самый длинный период отчёта, дней (такой же предел у данных кухни и выдачи). */
export const REPORT_MAX_DAYS = 366;
/** Период по умолчанию: последние столько дней, включая сегодняшний. */
export const REPORT_DEFAULT_DAYS = 30;

const dateSchema = z.string().refine(isDateISO, 'reports.error.date');

/** Запрос отчёта: период и страница таблицы. Всё необязательно. */
export const reportQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  page: z.coerce
    .number('reports.error.page')
    .int('reports.error.page')
    .min(1, 'reports.error.page')
    .max(100000, 'reports.error.page')
    .optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Запрос списка событий системы. */
export const eventsQuerySchema = z.object({
  kind: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,39}$/, 'reports.error.kind')
    .optional(),
  page: reportQuerySchema.shape.page,
});

const bilingual = z.object({ ru: z.string(), ro: z.string() });

export const rangeSchema = z.object({ from: z.string(), to: z.string() });
export type ReportRange = z.infer<typeof rangeSchema>;

export const pageInfoSchema = z.object({
  number: z.number().int(),
  size: z.number().int(),
  total: z.number().int(),
  pages: z.number().int(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;

// ---- продажи ----

export const salesRowSchema = z.object({
  gymId: z.string(),
  gymName: z.string(),
  /** Сколько боксов было в пакете (12, 20, 30, 1); `null` — кредиты без пакета (промокод, замена по жалобе). */
  packageBoxes: z.number().int().nullable(),
  boxes: z.number().int(),
  revenueBani: z.number().int(),
});
export type SalesRow = z.infer<typeof salesRowSchema>;

export const salesReportSchema = z.object({
  range: rangeSchema,
  totals: z.object({ orders: z.number().int(), boxes: z.number().int(), revenueBani: z.number() }),
  rows: z.array(salesRowSchema),
  /** Проданные пакеты за период: сколько оплачено и на какую сумму. */
  purchases: z.array(
    z.object({
      packageBoxes: z.number().int(),
      count: z.number().int(),
      totalBani: z.number().int(),
    }),
  ),
  daily: z.array(
    z.object({ date: z.string(), boxes: z.number().int(), revenueBani: z.number().int() }),
  ),
  page: pageInfoSchema,
});
export type SalesReport = z.infer<typeof salesReportSchema>;

// ---- выдано и списано ----

const writeOffReasonSchema = z.enum(WRITE_OFF_REASONS);

export const wasteRowSchema = z.object({
  /** `null` — списание лишнего бокса без заказа, блюдо неизвестно. */
  dishId: z.number().int().nullable(),
  name: bilingual.nullable(),
  cooked: z.number().int(),
  delivered: z.number().int(),
  writtenOff: z.number().int(),
  /** Списано ÷ приготовлено × 100, один знак после запятой; `null`, если ничего не готовили. */
  wastePercent: z.number().nullable(),
});
export type WasteRow = z.infer<typeof wasteRowSchema>;

export const wasteReportSchema = z.object({
  range: rangeSchema,
  totals: z.object({
    cooked: z.number().int(),
    delivered: z.number().int(),
    writtenOff: z.number().int(),
    wastePercent: z.number().nullable(),
  }),
  rows: z.array(wasteRowSchema),
  byFridge: z.array(
    z.object({
      /** `null` — запас на брак, который не раскладывается по холодильникам. */
      fridgeId: z.string().nullable(),
      fridgeName: z.string().nullable(),
      gymName: z.string().nullable(),
      cooked: z.number().int(),
      delivered: z.number().int(),
      writtenOff: z.number().int(),
      wastePercent: z.number().nullable(),
    }),
  ),
  byReason: z.array(z.object({ reason: writeOffReasonSchema, qty: z.number().int() })),
  daily: z.array(
    z.object({ date: z.string(), delivered: z.number().int(), writtenOff: z.number().int() }),
  ),
  page: pageInfoSchema,
});
export type WasteReport = z.infer<typeof wasteReportSchema>;

// ---- рейтинг блюд ----

export const ratingRowSchema = z.object({
  dishId: z.number().int(),
  name: bilingual,
  /** Оценки, поставленные за период. */
  count: z.number().int(),
  avg: z.number(),
  /** Рейтинг блюда за всё время (тот, что видит клиент в меню). */
  allTimeAvg: z.number().nullable(),
  allTimeCount: z.number().int(),
});
export type RatingRow = z.infer<typeof ratingRowSchema>;

export const ratingsReportSchema = z.object({
  range: rangeSchema,
  totals: z.object({ ratings: z.number().int(), avg: z.number().nullable() }),
  rows: z.array(ratingRowSchema),
  page: pageInfoSchema,
});
export type RatingsReport = z.infer<typeof ratingsReportSchema>;

// ---- доля зала ----

export const shareRowSchema = z.object({
  gymId: z.string(),
  gymName: z.string(),
  sharePercent: z.number(),
  boxes: z.number().int(),
  revenueBani: z.number().int(),
  /** Процент зала × выручка выданных боксов, округлено до бани. */
  shareBani: z.number().int(),
});
export type ShareRow = z.infer<typeof shareRowSchema>;

export const shareReportSchema = z.object({
  range: rangeSchema,
  totals: z.object({
    boxes: z.number().int(),
    revenueBani: z.number().int(),
    shareBani: z.number().int(),
  }),
  rows: z.array(shareRowSchema),
  page: pageInfoSchema,
});
export type ShareReport = z.infer<typeof shareReportSchema>;

// ---- активные клиенты и отток ----

export const retentionRowSchema = z.object({
  gymId: z.string(),
  gymName: z.string(),
  active: z.number().int(),
  previousActive: z.number().int(),
  churned: z.number().int(),
});
export type RetentionRow = z.infer<typeof retentionRowSchema>;

export const retentionReportSchema = z.object({
  range: rangeSchema,
  /** Предыдущий период той же длины, с которым сравнивается текущий. */
  previous: rangeSchema,
  totals: z.object({
    /** Клиенты, у которых за период выдан хотя бы один заказ. */
    active: z.number().int(),
    previousActive: z.number().int(),
    /** Брали в обоих периодах. */
    retained: z.number().int(),
    /** Брали сейчас, а в предыдущем периоде не брали. */
    fresh: z.number().int(),
    /** Брали в предыдущем периоде и не брали в текущем. */
    churned: z.number().int(),
    /** Отток ÷ активные клиенты предыдущего периода × 100; `null`, если их не было. */
    churnPercent: z.number().nullable(),
  }),
  rows: z.array(retentionRowSchema),
  page: pageInfoSchema,
});
export type RetentionReport = z.infer<typeof retentionReportSchema>;

// ---- события системы ----

export const systemEventSchema = z.object({
  id: z.number().int(),
  createdAt: z.string(),
  kind: z.string(),
  detail: z.record(z.string(), z.unknown()),
});
export type SystemEventDto = z.infer<typeof systemEventSchema>;

export const systemEventsSchema = z.object({
  /** Счётчики по видам событий за последние 24 часа. */
  counts24h: z.record(z.string(), z.number().int()),
  /** Виды событий, за которыми следит оповещение администратора. */
  alertKinds: z.array(z.string()),
  /** Сколько сбоев одного вида за час включает оповещение. */
  alertThreshold: z.number().int(),
  /** Пропущенных замеров температуры за последние дни: подробности — раздел «Температура». */
  missedTemperature: z.number().int(),
  items: z.array(systemEventSchema),
  page: pageInfoSchema,
});
export type SystemEventsResponse = z.infer<typeof systemEventsSchema>;
