// Текст ошибки API для человека: по ключу словаря на ТЕКУЩЕМ языке интерфейса.
import { ApiError, NetworkError } from '../../../api/index.ts';
import type { TFunction } from '../../../app/i18n.tsx';

export function describeError(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const text = t(error.messageKey, error.params);
    return text === error.messageKey ? error.message : text;
  }
  if (error instanceof NetworkError) return t('core.error.network');
  return t('core.error.generic');
}
