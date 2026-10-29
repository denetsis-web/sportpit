// Схемы API профиля, анкеты и нормы КБЖУ (модуль profile). Общие для сервера и клиента.
import { z } from 'zod';
import { ACTIVITY_LEVELS, GOALS, SEXES } from '../targets.ts';
import { authUserSchema, consentStateSchema, otpCodeSchema, phoneSchema } from './auth.ts';

/** Пределы полей анкеты: отсекают опечатки, а не «нормальные» значения. Возраст вне 18–80 принимается, но норма не считается. */
export const PROFILE_LIMITS = {
  age: { min: 10, max: 110 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 300 },
} as const;

export const sexSchema = z.enum(SEXES);
export const goalSchema = z.enum(GOALS);
export const activitySchema = z.enum(ACTIVITY_LEVELS);

/** Анкета цели: шесть полей и отметка о состоянии здоровья. */
export const profileInputSchema = z.object({
  sex: sexSchema,
  age: z.number().int().min(PROFILE_LIMITS.age.min).max(PROFILE_LIMITS.age.max),
  heightCm: z.number().int().min(PROFILE_LIMITS.heightCm.min).max(PROFILE_LIMITS.heightCm.max),
  weightKg: z.number().min(PROFILE_LIMITS.weightKg.min).max(PROFILE_LIMITS.weightKg.max),
  goal: goalSchema,
  activity: activitySchema,
  /** Диабет, беременность или другое состояние: вместо нормы — «Обратитесь к врачу». */
  hasCondition: z.boolean().default(false),
});
export type ProfileInput = z.input<typeof profileInputSchema>;
export type ProfileData = z.output<typeof profileInputSchema>;

export const profileSchema = profileInputSchema.extend({
  hasCondition: z.boolean(),
  /** Когда анкета последний раз сохранена (UTC, ISO 8601). */
  updatedAt: z.string(),
});
export type ProfileDto = z.infer<typeof profileSchema>;

const targetsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  proteinRangeG: z.object({ min: z.number(), max: z.number() }),
  fatG: z.number(),
  carbG: z.number(),
  fiberG: z.number(),
  floorApplied: z.boolean(),
});
const blockedSchema = z.object({ blocked: z.enum(['medical_condition', 'age_out_of_range']) });
export const targetsResultSchema = z.union([targetsSchema, blockedSchema]);

/** Ответ GET /profile: анкета и норма. Без действующего согласия на данные о здоровье оба поля пусты. */
export const profileResponseSchema = z.object({
  profile: profileSchema.nullable(),
  targets: targetsResultSchema.nullable(),
  /** Дано ли сейчас согласие на данные о здоровье (без него анкета не сохраняется и не показывается). */
  healthConsent: z.boolean(),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

// ---- телефон ----

export const phoneChangeRequestSchema = z.object({ phone: phoneSchema });
export const phoneChangeConfirmSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });
export const phoneChangeResponseSchema = z.object({ user: authUserSchema });

// ---- удаление аккаунта ----

/** Подтверждение удаления: без `confirm: true` сервер ничего не стирает. */
export const deleteAccountSchema = z.object({ confirm: z.literal(true) });

// ---- выгрузка данных ----

/**
 * Выгрузка данных клиента (R29.1): профиль и согласия собирает модуль profile,
 * остальное — зарегистрированные провайдеры других модулей (заказы, оценки, трекер) под своим именем.
 */
export const exportSchema = z.object({
  exportedAt: z.string(),
  user: z.object({ id: z.number().int(), phone: z.string(), lang: z.enum(['ru', 'ro']) }),
  profile: profileSchema.nullable(),
  consents: z.array(consentStateSchema),
  data: z.record(z.string(), z.unknown()),
});
export type DataExport = z.infer<typeof exportSchema>;
