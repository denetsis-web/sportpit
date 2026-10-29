// Уведомления «кредиты скоро сгорят» (R20.2, R39): за 7 дней до срока, один раз на лот.
// Работает от состояния базы (notified_at), а не от «сегодня ровно 02:30»: пропущенная ночь
// догоняется следующим запуском, повторный запуск ничего не дублирует.
import { EXPIRY_NOTICE_DAYS } from '@sportpit/shared/schemas/billing';
import type { AppDeps } from '../../app.ts';
import { notify } from '../notifications/index.ts';
import { addDaysIso, settleExpiry } from './ledger.ts';

type Deps = Pick<AppDeps, 'db' | 'clock'>;

/** Возвращает число отправленных уведомлений (одно на клиента за запуск, даже если лотов несколько). */
export function notifyExpiring(deps: Deps): number {
  const { db, clock } = deps;
  const now = clock.now();
  // сначала обрабатываем уже сгоревшее: на сгоревший лот уведомлять поздно
  settleExpiry({ db, clock });
  return db.tx((tx) => {
    const lots = tx.query<{ id: number; user_id: number; expires_at: string; remaining: number }>(
      `SELECT l.id, l.user_id, l.expires_at, COALESCE(SUM(e.delta), 0) AS remaining
         FROM credit_lots l
         JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL
         LEFT JOIN credit_ledger e ON e.lot_id = l.id
        WHERE l.expired_at IS NULL AND l.notified_at IS NULL
          AND l.expires_at > ? AND l.expires_at <= ?
        GROUP BY l.id
       HAVING remaining > 0
        ORDER BY l.expires_at, l.id`,
      [now.toISOString(), addDaysIso(now, EXPIRY_NOTICE_DAYS)],
    );
    const byUser = new Map<number, typeof lots>();
    for (const lot of lots) byUser.set(lot.user_id, [...(byUser.get(lot.user_id) ?? []), lot]);
    let sent = 0;
    for (const [userId, userLots] of byUser) {
      for (const lot of userLots) {
        tx.run('UPDATE credit_lots SET notified_at = ? WHERE id = ? AND notified_at IS NULL', [
          now.toISOString(),
          lot.id,
        ]);
      }
      notify({ db: tx, clock }, userId, 'credits_expiring', {
        count: userLots.reduce((sum, l) => sum + l.remaining, 0),
        expiresOn: clock.localDate(new Date(userLots[0]!.expires_at)),
        link: '/packages',
      });
      sent += 1;
    }
    return sent;
  });
}
