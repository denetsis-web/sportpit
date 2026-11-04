// Модуль growth: лист ожидания, события лендинга, воронка по источникам, источник регистраций.
// Публичный интерфейс для других модулей:
//   recordSignup(db, clock, userId, attribution?)  — вызывается auth внутри транзакции создания НОВОГО пользователя:
//                                                    пишет signup_attribution (регистрации воронка берёт из неё; отдельного события нет); без атрибуции источник `direct`.
// Маршруты (routes.ts): POST /waitlist и POST /track — публичные; /admin/waitlist, /admin/waitlist/csv,
// DELETE /admin/waitlist/:id, /admin/funnel — только администратор. Хук удаления аккаунта стирает запись листа по телефону, signup_attribution и события воронки с анонимными номерами человека.
// Что здесь персональные данные и как их хранить — docs/adr/0010-*.md.
import type { Attribution } from '@sportpit/shared/schemas/growth';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { resolveAttribution, saveSignupAttribution } from './events.ts';

/**
 * Источник регистрации нового пользователя. Синхронная: вызывать внутри `db.tx`,
 * чтобы пользователь и его источник появились вместе или не появились вовсе.
 */
export function recordSignup(
  db: Db,
  clock: Pick<Clock, 'now'>,
  userId: number,
  attribution: Attribution | undefined,
): void {
  const resolved = resolveAttribution(attribution);
  saveSignupAttribution(db, clock, userId, resolved);
}
