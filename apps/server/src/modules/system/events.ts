// Журнал событий системы (R57): сбои оплаты и SMS, ошибки сервера, сбои задач.
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';

/** Известные виды событий; допускаются и другие строки. */
export const EVENT_KINDS = {
  smsFailed: 'sms_failed',
  paymentFailed: 'payment_failed',
  serverError: 'server_error',
  jobFailed: 'job_failed',
  backupDone: 'backup_done',
} as const;

export type EventDetail = Record<string, unknown>;

export interface SystemEvent {
  id: number;
  createdAt: string;
  kind: string;
  detail: EventDetail;
}

export interface EventListOptions {
  kind?: string;
  limit?: number;
  offset?: number;
}

export interface EventLog {
  /** Пишет событие. Никогда не бросает исключение: сбой журнала не должен ломать основной сценарий. */
  log(kind: string, detail?: EventDetail): SystemEvent | undefined;
  /** Новые первыми. */
  list(options?: EventListOptions): SystemEvent[];
  countsSince(since: Date): Record<string, number>;
  /** Счётчики по видам за последние 24 часа (по часам `Clock`). */
  counts24h(): Record<string, number>;
  /** Подписка на новые события (например, уведомление администратора). Возвращает отписку. */
  subscribe(listener: (event: SystemEvent) => void): () => void;
}

const SECRET_KEY = /secret|token|password|passwd|api[-_]?key|authorization|cookie|card/i;

/** Заменяет значения под ключами, похожими на секреты, чтобы они не попали в журнал. */
export function redactDetail(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[глубоко]';
  if (Array.isArray(value)) return value.map((v) => redactDetail(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[скрыто]' : redactDetail(inner, depth + 1);
    }
    return out;
  }
  return value;
}

/** Приводит пойманную ошибку к безопасному виду для детали события. */
export function errorDetail(error: unknown): EventDetail {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

interface Row {
  id: number;
  created_at: string;
  kind: string;
  detail: string;
}

function toEvent(row: Row): SystemEvent {
  let detail: EventDetail = {};
  try {
    detail = JSON.parse(row.detail) as EventDetail;
  } catch {
    detail = { raw: row.detail };
  }
  return { id: row.id, createdAt: row.created_at, kind: row.kind, detail };
}

export function createEventLog(
  db: Db,
  clock: Clock,
  fallbackLogger?: { error(obj: unknown, msg?: string): void },
): EventLog {
  const listeners = new Set<(event: SystemEvent) => void>();

  const countsSince = (since: Date) => {
    const rows = db.query<{ kind: string; n: number }>(
      'SELECT kind, COUNT(*) AS n FROM system_events WHERE created_at >= ? GROUP BY kind ORDER BY kind',
      [since.toISOString()],
    );
    return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  };

  return {
    log(kind, detail = {}) {
      let event: SystemEvent | undefined;
      try {
        const createdAt = clock.now().toISOString();
        const safe = redactDetail(detail) as EventDetail;
        const { lastInsertRowid } = db.run(
          'INSERT INTO system_events (created_at, kind, detail) VALUES (?, ?, ?)',
          [createdAt, kind, JSON.stringify(safe)],
        );
        event = { id: Number(lastInsertRowid), createdAt, kind, detail: safe };
      } catch (error) {
        fallbackLogger?.error(
          { err: errorDetail(error), kind },
          'не удалось записать событие системы',
        );
        return undefined;
      }
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          fallbackLogger?.error({ err: errorDetail(error) }, 'сбой подписчика событий системы');
        }
      }
      return event;
    },
    list({ kind, limit = 50, offset = 0 } = {}) {
      const where = kind === undefined ? '' : 'WHERE kind = ?';
      const params = kind === undefined ? [limit, offset] : [kind, limit, offset];
      return db
        .query<Row>(
          `SELECT id, created_at, kind, detail FROM system_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
          params,
        )
        .map(toEvent);
    },
    countsSince,
    counts24h() {
      return countsSince(new Date(clock.now().getTime() - 24 * 60 * 60 * 1000));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
