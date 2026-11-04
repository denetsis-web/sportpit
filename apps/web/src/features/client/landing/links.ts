// Внешние ссылки лендинга берутся из словаря и выводятся, только если значение начинается с https://.
import { PLACEHOLDER } from '@sportpit/shared/schemas/admin';

/** Адрес, который можно выводить ссылкой: только https. Заглушка `[ВПИШИ]` и любой другой текст — нет. */
export function httpsLink(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  return /^https:\/\/\S+$/i.test(text) ? text : null;
}

/** Значение настройки заполнено (не пустое и не заглушка). */
export function isFilled(value: string | undefined): value is string {
  const text = (value ?? '').trim();
  return text !== '' && text !== PLACEHOLDER;
}

/** Телефон для ссылки `tel:`: только цифры, пробелы, скобки, дефисы и плюс. */
export function telLink(value: string): string | null {
  return /^\+?[\d\s()-]{5,}$/.test(value) ? `tel:${value.replace(/[\s()-]/g, '')}` : null;
}

export function mailLink(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null;
}
