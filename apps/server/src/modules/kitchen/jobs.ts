// Фоновые задачи kitchen. Идемпотентны и работают от состояния базы: пропущенный запуск
// (перезапуск процесса, занятость) догоняется следующим — берутся все даты, у которых срок уже прошёл.
import type { AppDeps } from '../../app.ts';
import type { Scheduler } from '../system/index.ts';
import { kitchenFor } from './index.ts';

/** Каждую минуту: у холодильников свои сроки приёма (cutoffTime), поэтому одного часа в сутках нет. */
export const CLOSE_CRON = '* * * * *';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  const kitchen = kitchenFor(deps);
  scheduler.register('kitchen-close', CLOSE_CRON, () => {
    kitchen.closeDue();
  });
}
