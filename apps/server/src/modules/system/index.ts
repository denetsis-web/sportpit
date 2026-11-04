// Модуль system: события системы, планировщик, резервные копии, конфигурация, ошибки API.
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { createBackup, type BackupResult } from './backup.ts';
import type { Config } from './config.ts';
import { createEventLog, type EventDetail, type EventLog, type SystemEvent } from './events.ts';
import { createScheduler, type Scheduler } from './scheduler.ts';

export * from './backup.ts';
export * from './config.ts';
export * from './discovery.ts';
export * from './errors.ts';
export * from './events.ts';
export * from './http.ts';
export * from './i18n.ts';
export * from './ratelimit.ts';
export * from './scheduler.ts';

/**
 * Запросов входа с одного IP за окно `LOGIN_RATE_WINDOW_MS` — отдельно на выдачу кода и на проверку (G01).
 * Зал с общим Wi-Fi даёт много людей с одного адреса, поэтому здесь запас; лимиты на номер (раз в минуту,
 * 5 в час, 5 попыток) и на пользователя (смена телефона, `LOGIN_RATE_MAX`) остаются прежними.
 */
export const LOGIN_IP_RATE_MAX = 60;

/** То, что модули получают в `deps.system`. */
export interface SystemApi {
  logEvent(kind: string, detail?: EventDetail): SystemEvent | undefined;
  events: EventLog;
  scheduler: Scheduler;
  /** Делает резервную копию базы и удаляет копии сверх лимита хранения. */
  backup(): BackupResult;
}

export interface SystemOptions {
  db: Db;
  clock: Clock;
  config: Pick<Config, 'backupDir' | 'backup'>;
  logger?: { error(obj: unknown, msg?: string): void };
}

export function createSystem({ db, clock, config, logger }: SystemOptions): SystemApi {
  const events = createEventLog(db, clock, logger);
  const scheduler = createScheduler({ clock, events });
  return {
    logEvent: (kind, detail) => events.log(kind, detail),
    events,
    scheduler,
    backup: () => createBackup(db, { dir: config.backupDir, clock, keep: config.backup.keep }),
  };
}
