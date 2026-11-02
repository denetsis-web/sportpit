// Общие помощники маршрутов (F1.16): разбор тел запросов схемой и заголовок no-store.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, noStore, parseWith } from '../src/modules/system/index.ts';

const schema = z.object({
  name: z.string().min(2, 'billing.error.name'),
  count: z.number().int(),
  nested: z.object({ a: z.string() }).optional(),
});

function failure(call: () => unknown): AppError {
  try {
    call();
  } catch (error) {
    return error as AppError;
  }
  throw new Error('ожидалась ошибка');
}

describe('parseWith(schema, body, prefix)', () => {
  it('верное тело возвращает разобранные данные; пустое тело читается как {}', () => {
    expect(parseWith(schema, { name: 'ab', count: 1 }, 'billing')).toEqual({
      name: 'ab',
      count: 1,
    });
    expect(parseWith(z.object({}), undefined, 'billing')).toEqual({});
  });

  it('ошибка — 400 validation_failed; ключ словаря своего модуля сохраняется, чужой заменяется общим', () => {
    const error = failure(() => parseWith(schema, { name: 'a', count: 1.5 }, 'billing'));
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('validation_failed');
    expect(error.messageKey).toBe('core.error.validation');
    expect(error.fields).toEqual({ name: 'billing.error.name', count: 'core.error.validation' });
    // тот же ключ у другого модуля — уже «чужой»
    expect(failure(() => parseWith(schema, { name: 'a', count: 1 }, 'orders')).fields).toEqual({
      name: 'core.error.validation',
    });
  });

  it('несколько пространств; вложенные поля — через точку; первая ошибка поля побеждает', () => {
    const nested = z.object({ nested: z.object({ a: z.string('admin.error.a') }) });
    expect(failure(() => parseWith(nested, { nested: {} }, ['catalog', 'admin'])).fields).toEqual({
      'nested.a': 'admin.error.a',
    });
    expect(failure(() => parseWith(nested, {}, 'admin')).fields).toEqual({
      nested: 'core.error.validation',
    });
  });

  it('fieldMessages: ошибка поля получает свой текст и становится сообщением ответа (вход по телефону)', () => {
    const login = z.object({ phone: z.string().regex(/^\+\d+$/), code: z.string().length(6) });
    const error = failure(() =>
      parseWith(login, { phone: 'x', code: '1' }, 'auth', {
        fieldMessages: { phone: 'auth.error.phone', code: 'auth.error.codeFormat' },
      }),
    );
    expect(error.fields).toEqual({ phone: 'auth.error.phone', code: 'auth.error.codeFormat' });
    expect(error.messageKey).toBe('auth.error.phone');
  });
});

describe('noStore(reply)', () => {
  it('ставит cache-control: no-store и возвращает reply', () => {
    const headers: Record<string, string> = {};
    const reply = {
      header(name: string, value: string) {
        headers[name] = value;
        return reply;
      },
    };
    expect(noStore(reply as never)).toBe(reply);
    expect(headers).toEqual({ 'cache-control': 'no-store' });
  });
});
