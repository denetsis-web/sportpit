// Фоновые задачи billing. Обе идемпотентны и работают от состояния базы: пропущенный запуск
// (перезапуск процесса, занятость) догоняется следующим.
import type { AppDeps } from '../../app.ts';
import type { Scheduler } from '../system/index.ts';
import { billingFor } from './index.ts';

/** Сгорание лотов и уведомления за 7 дней: 02:30 по Кишинёву (минута существует и при переводе часов). */
export const EXPIRE_CRON = '30 2 * * *';
/** Закрытие неоплаченных покупок старше 30 минут. */
export const PENDING_CRON = '*/10 * * * *';

export function registerJobs(scheduler: Scheduler, deps: AppDeps): void {
  const billing = billingFor(deps);
  scheduler.register('billing-expire', EXPIRE_CRON, () => {
    billing.expireDue();
    billing.notifyExpiring();
  });
  scheduler.register('billing-pending', PENDING_CRON, async () => {
    await billing.expirePendingPurchases();
  });
}
