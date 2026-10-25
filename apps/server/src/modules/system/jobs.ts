import { basename } from 'node:path';
import type { AppDeps } from '../../app.ts';
import { EVENT_KINDS } from './events.ts';
import type { Scheduler } from './scheduler.ts';

/** Ежедневная резервная копия базы в 03:00 по Кишинёву; хранится 14 копий. */
export const BACKUP_CRON = '0 3 * * *';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  scheduler.register('backup', BACKUP_CRON, () => {
    const result = deps.system.backup();
    deps.system.logEvent(EVENT_KINDS.backupDone, {
      file: basename(result.path),
      removed: result.removed.length,
    });
  });
}
