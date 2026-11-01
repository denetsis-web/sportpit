// Схемы API обратной связи (модуль feedback): оценки блюд, жалобы, решения администратора.
// Сообщения проверки — ключи словаря `feedback.error.*`.
import { z } from 'zod';
import { PHOTO_MAX_BYTES, PHOTO_TYPES, REVIEW_TAGS } from './catalog.ts';
import { orderStatusSchema } from './orders.ts';

export { PHOTO_MAX_BYTES, PHOTO_TYPES, REVIEW_TAGS };

// ---- оценки (R26) ----

/** Правка оценки возможна в течение 24 часов после первой. */
export const RATING_EDIT_WINDOW_HOURS = 24;

const orderIdSchema = z
  .string()
  .trim()
  .min(1, 'feedback.error.order')
  .max(64, 'feedback.error.order');
const dishIdSchema = z
  .number('feedback.error.dish')
  .int('feedback.error.dish')
  .positive('feedback.error.dish');

export const rateInputSchema = z.object({
  orderId: orderIdSchema,
  dishId: dishIdSchema,
  stars: z
    .number('feedback.error.stars')
    .int('feedback.error.stars')
    .min(1, 'feedback.error.stars')
    .max(5, 'feedback.error.stars'),
  tag: z.enum(REVIEW_TAGS, 'feedback.error.tag').nullish(),
});
export type RateInput = z.infer<typeof rateInputSchema>;

const bilingual = z.object({ ru: z.string(), ro: z.string() });

export const ratingSchema = z.object({
  orderId: z.string(),
  dishId: z.number().int(),
  stars: z.number().int().min(1).max(5),
  tag: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** До какого момента (UTC) оценку можно править. */
  editableUntil: z.string(),
  canEdit: z.boolean(),
});
export type RatingDto = z.infer<typeof ratingSchema>;

export const ratingResponseSchema = z.object({ rating: ratingSchema });

export const rateableDishSchema = z.object({
  dishId: z.number().int(),
  name: bilingual,
  qty: z.number().int(),
  rating: ratingSchema.nullable(),
});

/** Заказ клиента, по которому можно оценить блюда (выдан) или пожаловаться (загружен, выдан, списан). */
export const feedbackOrderSchema = z.object({
  orderId: z.string(),
  date: z.string(),
  status: orderStatusSchema,
  /** Оценить можно, только если бокс выдан. */
  canRate: z.boolean(),
  fridgeName: z.string().nullable(),
  gymName: z.string().nullable(),
  dishes: z.array(rateableDishSchema),
  /** Жалобу на заказ можно подать: нет открытой и нет решённой жалобы. */
  canComplain: z.boolean(),
});
export type FeedbackOrderDto = z.infer<typeof feedbackOrderSchema>;

export const feedbackOrdersSchema = z.object({ items: z.array(feedbackOrderSchema) });
export type FeedbackOrdersDto = z.infer<typeof feedbackOrdersSchema>;

// ---- жалобы (R30, R38, R44) ----

export const COMPLAINT_REASONS = [
  'spoiled',
  'wrong_dish',
  'damaged',
  'missing',
  'kbzhu',
  'other',
] as const;
export type ComplaintReason = (typeof COMPLAINT_REASONS)[number];
export const complaintReasonSchema = z.enum(COMPLAINT_REASONS, 'feedback.error.reason');

export const COMPLAINT_STATUSES = ['open', 'resolved', 'rejected'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

/** Исходы решения: замена другим блюдом и возврат кредита дают +1 кредит, отказ — только комментарий. */
export const COMPLAINT_OUTCOMES = ['replacement', 'refund', 'reject'] as const;
export type ComplaintOutcome = (typeof COMPLAINT_OUTCOMES)[number];

export const COMPLAINT_DESCRIPTION_MAX = 1000;
export const COMPLAINT_COMMENT_MIN = 3;
export const COMPLAINT_COMMENT_MAX = 500;

/** Текстовые поля формы жалобы (приходят в multipart вместе с фото). */
export const complaintInputSchema = z.object({
  orderId: orderIdSchema,
  dishId: dishIdSchema.optional(),
  reason: complaintReasonSchema,
  description: z
    .string()
    .trim()
    .max(COMPLAINT_DESCRIPTION_MAX, 'feedback.error.description')
    .default(''),
});
export type ComplaintInput = z.infer<typeof complaintInputSchema>;

export const resolveInputSchema = z
  .object({
    outcome: z.enum(COMPLAINT_OUTCOMES, 'feedback.error.outcome'),
    comment: z.string().trim().max(COMPLAINT_COMMENT_MAX, 'feedback.error.comment').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === 'reject' && (value.comment ?? '').length < COMPLAINT_COMMENT_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'feedback.error.commentRequired',
      });
    }
  });
export type ResolveInput = z.infer<typeof resolveInputSchema>;

export const complaintPhotoSchema = z.object({
  id: z.number().int(),
  /** Адрес отдаёт модуль обратной связи с проверкой прав (не публичный путь файлов). */
  url: z.string(),
  contentType: z.string(),
});

export const COMPLAINT_EVENT_KINDS = ['created', 'replacement', 'refund', 'rejected'] as const;

export const complaintEventSchema = z.object({
  kind: z.enum(COMPLAINT_EVENT_KINDS),
  at: z.string(),
  comment: z.string().nullable(),
});

export const complaintSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  orderDate: z.string().nullable(),
  dishId: z.number().int().nullable(),
  dishName: bilingual.nullable(),
  reason: z.enum(COMPLAINT_REASONS),
  description: z.string(),
  status: z.enum(COMPLAINT_STATUSES),
  outcome: z.enum(COMPLAINT_OUTCOMES).nullable(),
  /** Комментарий администратора (при отказе — причина). */
  comment: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  photos: z.array(complaintPhotoSchema),
  history: z.array(complaintEventSchema),
});
export type ComplaintDto = z.infer<typeof complaintSchema>;

export const complaintResponseSchema = z.object({ complaint: complaintSchema });

export const supportContactsSchema = z.object({
  phone: z.string(),
  email: z.string(),
  messenger: z.string(),
});

/** Раздел «Поддержка»: контакты из настроек и обращения клиента. */
export const supportSchema = z.object({
  contacts: supportContactsSchema,
  complaints: z.array(complaintSchema),
});
export type SupportDto = z.infer<typeof supportSchema>;

/** Жалоба в очереди администратора: то же и название зала/холодильника. */
export const adminComplaintSchema = complaintSchema.extend({
  userId: z.number().int(),
  fridgeName: z.string().nullable(),
  gymName: z.string().nullable(),
  items: z.array(z.object({ dishId: z.number().int(), name: bilingual, qty: z.number().int() })),
});
export type AdminComplaintDto = z.infer<typeof adminComplaintSchema>;

export const adminComplaintsSchema = z.object({
  items: z.array(adminComplaintSchema),
  openCount: z.number().int().nonnegative(),
});
export type AdminComplaintsDto = z.infer<typeof adminComplaintsSchema>;

export const adminComplaintResponseSchema = z.object({ complaint: adminComplaintSchema });

export const complaintListQuerySchema = z.object({
  status: z.enum(['open', 'all']).default('open'),
});
