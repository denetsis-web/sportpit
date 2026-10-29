// Проверка тел запросов схемами zod: ошибка полей уходит клиенту ключами словаря.
import type { z } from 'zod';
import { AppError } from '../system/errors.ts';

const OWN_KEY = /^(admin|catalog)\.error\./;

/** Разбирает тело запроса; при ошибке — 400 `validation_failed` с `fields` (поле → ключ словаря). */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const name = issue.path.map(String).join('.') || '_';
    fields[name] ??= OWN_KEY.test(issue.message) ? issue.message : 'core.error.validation';
  }
  throw new AppError(400, 'validation_failed', 'core.error.validation', { fields });
}
