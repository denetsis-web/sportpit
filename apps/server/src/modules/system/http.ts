// Общие помощники маршрутов: разбор тел и запросов схемой zod и запрет кэширования ответа.
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { AppError, errors } from './errors.ts';

export interface ParseOptions {
  /**
   * Тексты для известных полей по имени первого элемента пути. С этой настройкой ответ получает
   * сообщение первой ошибки поля (а не общее «проверьте данные») — так сделан вход по телефону.
   */
  fieldMessages?: Record<string, string>;
}

/**
 * Разбирает тело (или запрос) схемой. Ошибка — 400 `validation_failed` с `fields` (поле → ключ словаря):
 * ключ вида `<пространство>.error.*` из схемы сохраняется, любой другой заменяется общим
 * `core.error.validation`. `prefix` — пространство (или пространства) словаря модуля, например `'billing'`.
 */
export function parseWith<S extends z.ZodType>(
  schema: S,
  body: unknown,
  prefix: string | readonly string[],
  options: ParseOptions = {},
): z.infer<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  const { fieldMessages } = options;
  if (fieldMessages) {
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? '_');
      fields[name] = fieldMessages[name] ?? 'core.error.validation';
    }
    const first = Object.values(fields)[0] ?? 'core.error.validation';
    throw new AppError(400, 'validation_failed', first, { fields });
  }
  const own = new RegExp(`^(${[prefix].flat().join('|')})\.error\.`);
  for (const issue of result.error.issues) {
    const name = issue.path.map(String).join('.') || '_';
    fields[name] ??= own.test(issue.message) ? issue.message : 'core.error.validation';
  }
  throw errors.validation(fields);
}

/** Ответ не кэшируется: личные данные, остатки, статусы. */
export const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');
