// Пауза пакета (R27.1): до 14 дней, один раз на пакет (лот кредитов). Срок лота сдвигается на дни паузы.
//
// Пауза недоступна, пока у клиента есть подтверждённые заказы на дни паузы (таблица orders),
// и на дни паузы новый заказ не оформляется (проверяет модуль заказов через isPausedOn).
// Баланс и журнал кредитов пауза не трогает: меняется только credit_lots.expires_at, прежний срок
// остаётся в lot_pauses. Функции синхронные, пишут в одной транзакции.
import { PAUSE_MAX_DAYS, type PauseCreate, type PauseDto } from '@sportpit/shared/schemas/orders';
import { addDaysISO } from '@sportpit/shared/time';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';
import { addDaysIso, lotRemaining, type LotRow } from './ledger.ts';

interface PauseRow {
  lot_id: number;
  starts_on: string;
  ends_on: string;
  days: number;
  previous_expires_at: string;
  new_expires_at: string;
}

const toDto = (row: PauseRow): PauseDto => ({
  lotId: row.lot_id,
  from: row.starts_on,
  until: row.ends_on,
  days: row.days,
  expiresAt: row.new_expires_at,
  previousExpiresAt: row.previous_expires_at,
});

const conflict = (code: string, key: string) => new AppError(409, code, `orders.error.${key}`);

/** Ставит лот клиента на паузу с дня `from` на `days` дней и сдвигает его срок. */
export function pauseLot(
  ctx: { db: Db; clock: Clock },
  userId: number,
  input: PauseCreate,
): PauseDto {
  const { db, clock } = ctx;
  return db.tx((tx) => {
    const lot = tx.get<LotRow>('SELECT * FROM credit_lots WHERE id = ? AND user_id = ?', [
      input.lotId,
      userId,
    ]);
    if (!lot) throw new AppError(404, 'pause_lot_not_found', 'orders.error.pauseLotNotFound');
    if (tx.get('SELECT 1 AS x FROM lot_pauses WHERE lot_id = ?', [lot.id])) {
      throw conflict('pause_used', 'pauseUsed');
    }
    const now = clock.now();
    if (
      lot.expired_at !== null ||
      lot.expires_at <= now.toISOString() ||
      lotRemaining(tx, lot.id) <= 0
    ) {
      throw conflict('pause_expired', 'pauseExpired');
    }
    if (
      !Number.isInteger(input.days) ||
      input.days < 1 ||
      input.days > PAUSE_MAX_DAYS ||
      input.from < clock.localDate() ||
      input.from > clock.localDate(new Date(lot.expires_at))
    ) {
      throw conflict('pause_start', 'pauseStart');
    }
    const endsOn = addDaysISO(input.from, input.days - 1);
    const blocking = tx.get(
      `SELECT 1 AS x FROM orders
        WHERE user_id = ? AND date BETWEEN ? AND ? AND status IN ('confirmed', 'loaded')`,
      [userId, input.from, endsOn],
    );
    if (blocking) throw conflict('pause_has_orders', 'pauseHasOrders');

    const newExpiresAt = addDaysIso(new Date(lot.expires_at), input.days);
    tx.run(
      `INSERT INTO lot_pauses
         (lot_id, user_id, starts_on, ends_on, days, previous_expires_at, new_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lot.id,
        userId,
        input.from,
        endsOn,
        input.days,
        lot.expires_at,
        newExpiresAt,
        now.toISOString(),
      ],
    );
    // срок сдвинут: напоминание «за 7 дней до сгорания» должно прийти заново, к новому сроку
    tx.run('UPDATE credit_lots SET expires_at = ?, notified_at = NULL WHERE id = ?', [
      newExpiresAt,
      lot.id,
    ]);
    return toDto(tx.get<PauseRow>('SELECT * FROM lot_pauses WHERE lot_id = ?', [lot.id])!);
  });
}

/** Паузы клиента, ближайшие первыми. */
export function listPauses(db: Db, userId: number): PauseDto[] {
  return db
    .query<PauseRow>('SELECT * FROM lot_pauses WHERE user_id = ? ORDER BY starts_on, lot_id', [
      userId,
    ])
    .map(toDto);
}

/** День попадает в действующую паузу клиента: заказ на этот день не оформляется. */
export function isPausedOn(db: Db, userId: number, date: string): boolean {
  return (
    db.get('SELECT 1 AS x FROM lot_pauses WHERE user_id = ? AND ? BETWEEN starts_on AND ends_on', [
      userId,
      date,
    ]) !== undefined
  );
}
