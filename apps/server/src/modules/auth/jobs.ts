// Ночная очистка: истёкшие сессии и старые коды входа не копятся в базе.
import type { AppDeps } from '../../app.ts';
import type { Scheduler } from '../system/index.ts';
import { authFor } from './index.ts';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  scheduler.register('auth-cleanup', '20 3 * * *', () => {
    authFor(deps).purgeExpired();
  });
}
