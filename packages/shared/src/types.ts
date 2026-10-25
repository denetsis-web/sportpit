// Базовые перечисления домена, общие для сервера и клиента.
// OrderStatus лежит в schemas/orders (таск 06), расчёт нормы КБЖУ — в profile (таск 02).

export const ROLES = ['client', 'kitchen', 'operator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Причины списания бокса (R35.1). */
export const WRITE_OFF_REASONS = ['not_picked_up', 'defect', 'expired', 'other'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

/** Причины записей журнала кредитов; баланс считается только из журнала. */
export const LEDGER_REASONS = [
  'purchase',
  'reserve',
  'release',
  'consume',
  'expire',
  'carryover',
  'refund',
  'complaint_credit',
  'adjustment',
] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

export const CURRENCY = 'MDL';
export type Currency = typeof CURRENCY;

/** Деньги везде — целые бани (1 лей = 100 бань). */
export type Bani = number;

/** Тело ошибки API: `{ error: { code, messageKey, message, params? } }`. */
export interface ApiErrorBody {
  error: {
    code: string;
    /** Ключ словаря, например `core.error.forbidden`. */
    messageKey: string;
    /** Готовый текст на языке запроса (заголовок Accept-Language). */
    message: string;
    params?: Record<string, string | number>;
    /** Поля, не прошедшие проверку: имя поля → ключ словаря. */
    fields?: Record<string, string>;
  };
}
