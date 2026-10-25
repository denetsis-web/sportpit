// Схемы API входа, ролей и согласий (модуль auth). Общие для сервера и клиента.
import { z } from 'zod';
import { ROLES } from '../types.ts';

/** Код входа: 6 цифр, живёт 5 минут, не более 5 попыток. */
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
/** Повторный запрос кода: не чаще раза в минуту и не более 5 в час на номер. */
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;
/** Сессия живёт 30 дней. */
export const SESSION_TTL_DAYS = 30;

/** Номер в формате +373XXXXXXXX (8 цифр после кода страны). */
export const PHONE_PATTERN = /^\+373\d{8}$/;

/** Убирает пробелы, дефисы и скобки, которые люди вводят в номер; формат проверяется после этого. */
export function cleanPhoneInput(input: string): string {
  return input.replace(/[\s().-]/g, '');
}

export const phoneSchema = z.string().trim().regex(PHONE_PATTERN, 'auth.error.phone');
export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'auth.error.codeFormat');

export const roleSchema = z.enum(ROLES);
export const langSchema = z.enum(['ru', 'ro']);

export const otpRequestSchema = z.object({ phone: phoneSchema });
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpRequestResponseSchema = z.object({
  ok: z.literal(true),
  /** Через сколько секунд можно запросить код снова. */
  retryAfterSeconds: z.number().int().nonnegative(),
  /** Сколько секунд код действует. */
  expiresInSeconds: z.number().int().positive(),
});
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  /** Язык интерфейса на устройстве: сохраняется в профиле. */
  lang: langSchema.optional(),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

// ---- согласия ----

export const CONSENT_KINDS = ['terms', 'privacy', 'health_data'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];
export const consentKindSchema = z.enum(CONSENT_KINDS);

/**
 * Действующая версия текста каждого согласия. Меняется вместе с текстом политики:
 * старые согласия остаются в истории с прежней версией, а клиента просят принять новую.
 */
export const CONSENT_VERSIONS: Record<ConsentKind, string> = {
  terms: '2026-10-25',
  privacy: '2026-10-25',
  health_data: '2026-10-25',
};

export const consentChangeSchema = z.object({
  kind: consentKindSchema,
  granted: z.boolean(),
  /** Версия текста, которую видел человек; должна совпасть с действующей. */
  version: z.string().min(1),
});
export type ConsentChange = z.infer<typeof consentChangeSchema>;

/** Несколько решений одним запросом: сохраняются все или ни одно. */
export const consentChangesSchema = z.object({
  changes: z.array(consentChangeSchema).min(1).max(CONSENT_KINDS.length),
});

export const consentStateSchema = z.object({
  kind: consentKindSchema,
  /** Действующая версия текста. */
  version: z.string(),
  /** Согласие дано на действующую версию текста. */
  granted: z.boolean(),
  /** Версия, на которую дано последнее решение, и когда (UTC, ISO 8601). */
  decidedVersion: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
export type ConsentState = z.infer<typeof consentStateSchema>;

export const consentsResponseSchema = z.object({ items: z.array(consentStateSchema) });
export type ConsentsResponse = z.infer<typeof consentsResponseSchema>;

// ---- пользователь ----

export const authUserSchema = z.object({
  id: z.number().int(),
  phone: z.string(),
  role: roleSchema,
  lang: langSchema,
  /** Идентификаторы холодильников оператора (у остальных ролей пусто). */
  fridgeIds: z.array(z.string()),
});
export type AuthUserDto = z.infer<typeof authUserSchema>;

export const meResponseSchema = z.object({ user: authUserSchema.nullable() });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const verifyResponseSchema = z.object({ user: authUserSchema });
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

export const profileLangSchema = z.object({ lang: langSchema });

// ---- управление ролями (администратор) ----

export const setRoleSchema = z.object({ role: roleSchema });
export const setFridgesSchema = z.object({
  fridgeIds: z.array(z.string().min(1).max(64)).max(200),
});

export const userListResponseSchema = z.object({ items: z.array(authUserSchema) });
