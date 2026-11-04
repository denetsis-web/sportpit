// Модуль growth: лист ожидания, события лендинга, воронка по источникам, источник регистраций.
// Публичный интерфейс для других модулей:
//   recordSignup(db, clock, userId, attribution?)  — вызывается auth внутри транзакции создания НОВОГО пользователя:
//                                                    пишет signup_attribution и событие `signup`; без атрибуции источник `direct`.
// Маршруты (routes.ts): POST /waitlist и POST /track — публичные; /admin/waitlist, /admin/waitlist/csv,
// DELETE /admin/waitlist/:id, /admin/funnel — только администратор. Хук удаления аккаунта стирает signup_attribution.
// Что здесь персональные данные и как их хранить — docs/adr/0010-*.md.
import type { Attribution } from '@sportpit/shared/schemas/growth';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { recordEvent, resolveAttribution, saveSignupAttribution } from './events.ts';

/**
 * Источник и анонимный номер нового пользователя. Синхронная: вызывать внутри `db.tx`,
 * чтобы пользователь, его источник и событие появились вместе или не появились вовсе.
 */
export function recordSignup(
  db: Db,
  clock: Pick<Clock, 'now'>,
  userId: number,
  attribution: Attribution | undefined,
): void {
  const resolved = resolveAttribution(attribution);
  saveSignupAttribution(db, clock, userId, resolved);
  recordEvent(db, clock, 'signup', resolved);
}
