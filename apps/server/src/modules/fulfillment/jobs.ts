// Фоновые задачи fulfillment. Идемпотентны и работают от состояния базы: пропущенный запуск
// (перезапуск процесса, занятость) догоняется следующим — закрываются все холодильники и даты,
// у которых остались невыданные заказы и день уже прошёл либо наступило 23:59 по Кишинёву.
import type { AppDeps } from '../../app.ts';
import type { Scheduler } from '../system/index.ts';
import { fulfillmentFor } from './index.ts';

/** Каждую минуту: окно 23:59 узкое, а пропущенные дни должны закрываться при первой возможности. */
export const CLOSE_DAY_CRON = '* * * * *';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  const fulfillment = fulfillmentFor(deps);
  scheduler.register('fulfillment-close-day', CLOSE_DAY_CRON, () => {
    fulfillment.closeDue();
  });
}
