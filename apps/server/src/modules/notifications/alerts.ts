// Системные уведомления администраторам (R57.1): 3 и более сбоя оплаты или SMS за час.
// Считается отдельно по виду сбоя. Пока по этому виду уже есть уведомление за последний час,
// новое не создаётся (иначе каждый следующий сбой заваливал бы колокольчик).
import type { AppDeps } from '../../app.ts';
import { authFor } from '../auth/index.ts';
import { EVENT_KINDS, type SystemEvent } from '../system/index.ts';
import { notificationsFor } from './index.ts';

export const ALERT_KINDS: readonly string[] = [EVENT_KINDS.smsFailed, EVENT_KINDS.paymentFailed];
export const ALERT_THRESHOLD = 3;
export const ALERT_WINDOW_MS = 60 * 60 * 1000;

export function watchSystemEvents(deps: AppDeps): () => void {
  const { db, clock, system } = deps;
  const notifications = notificationsFor(deps);
  const auth = authFor(deps);

  function onEvent(event: SystemEvent): void {
    if (!ALERT_KINDS.includes(event.kind)) return;
    const since = new Date(clock.now().getTime() - ALERT_WINDOW_MS);
    const count = system.events.countsSince(since)[event.kind] ?? 0;
    if (count < ALERT_THRESHOLD) return;
    const already = db.get(
      `SELECT 1 AS x FROM notifications
       WHERE type = 'system_alert' AND created_at >= ? AND json_extract(payload, '$.kind') = ?
       LIMIT 1`,
      [since.toISOString(), event.kind],
    );
    if (already) return;
    db.tx(() => {
      for (const adminId of auth.userIdsByRole('admin')) {
        notifications.notify(adminId, 'system_alert', { kind: event.kind, count });
      }
    });
  }

  return system.events.subscribe(onEvent);
}
