// Ночная чистка: анкеты тех, кто отозвал согласие на данные о здоровье, стираются, даже если человек не заходил.
// Работает от состояния в базе, пропущенный запуск догоняется следующим.
import type { AppDeps } from '../../app.ts';
import type { Scheduler } from '../system/index.ts';
import { profileFor } from './index.ts';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  scheduler.register('profile-purge-revoked', '40 3 * * *', () => {
    profileFor(deps).purgeRevoked();
  });
}
