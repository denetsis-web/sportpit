// Лимит запросов в памяти процесса: скользящее окно по ключу (IP, номер пользователя).
// Один процесс сервера — одного хранилища достаточно; после перезапуска счётчики обнуляются.
import type { Clock } from '../clock/index.ts';
import { errors } from './errors.ts';

export interface RateLimiter {
  /** Засчитывает запрос; сверх лимита бросает 429 «подождите N сек». */
  hit(key: string): void;
}

export interface RateLimiterOptions {
  clock: Pick<Clock, 'now'>;
  max: number;
  windowMs: number;
}

/** Не даёт карте ключей расти без границ: при переполнении выбрасываются ключи с устаревшими запросами. */
const MAX_KEYS = 10_000;

export function createRateLimiter({ clock, max, windowMs }: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key) {
      const now = clock.now().getTime();
      const recent = (hits.get(key) ?? []).filter((at) => at > now - windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        throw errors.rateLimited(Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)));
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > MAX_KEYS) {
        for (const [other, times] of hits) {
          if (times.every((at) => at <= now - windowMs)) hits.delete(other);
        }
      }
    },
  };
}

/** Общие границы для входа: 10 запросов за 10 минут с одного адреса (или от одного пользователя). */
export const LOGIN_RATE_MAX = 10;
export const LOGIN_RATE_WINDOW_MS = 10 * 60_000;
