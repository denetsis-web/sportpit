// Фоновая задача feedback: удаление из хранилища файлов, поставленных в очередь при удалении аккаунта.
// Идемпотентна и работает от состояния базы: что не удалилось сразу, уйдёт при следующем проходе.
import type { AppDeps } from '../../app.ts';
import type { Scheduler } from '../system/index.ts';
import { feedbackFor } from './index.ts';

export const TRASH_CRON = '*/10 * * * *';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  const feedback = feedbackFor(deps);
  scheduler.register('feedback-trash', TRASH_CRON, async () => {
    await feedback.sweepTrash();
  });
}
