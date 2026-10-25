// Ошибки API. Модуль бросает `AppError`, каркас превращает её в ответ
// `{ error: { code, messageKey, message, params?, fields? } }` на языке запроса.
import type { TranslateParams } from '@sportpit/shared/i18n';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly params: TranslateParams | undefined;
  readonly fields: Record<string, string> | undefined;

  constructor(
    status: number,
    code: string,
    messageKey: string,
    options: { params?: TranslateParams; fields?: Record<string, string> } = {},
  ) {
    super(`${code}: ${messageKey}`);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.messageKey = messageKey;
    this.params = options.params;
    this.fields = options.fields;
  }
}

export const errors = {
  badRequest: (messageKey = 'core.error.badRequest', fields?: Record<string, string>) =>
    new AppError(400, 'bad_request', messageKey, fields ? { fields } : {}),
  validation: (fields: Record<string, string> = {}) =>
    new AppError(400, 'validation_failed', 'core.error.validation', { fields }),
  unauthorized: () => new AppError(401, 'unauthorized', 'core.error.unauthorized'),
  forbidden: () => new AppError(403, 'forbidden', 'core.error.forbidden'),
  notFound: (messageKey = 'core.error.notFound') => new AppError(404, 'not_found', messageKey),
  /** 429 с текстом «подождите N сек». */
  rateLimited: (seconds: number) =>
    new AppError(429, 'rate_limited', 'core.error.rateLimited', { params: { seconds } }),
};
