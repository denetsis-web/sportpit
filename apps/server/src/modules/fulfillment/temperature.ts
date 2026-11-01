// Температура холодильников (R34.1, R34.2): два замера в день, подсветка выхода за 0…+5 °C,
// событие `temperature_out_of_range` и список пропущенных замеров для администратора.
import {
  isOutOfRange,
  MISSED_DEFAULT_DAYS,
  MISSED_MAX_DAYS,
  TEMPERATURE_DEADLINES,
  TEMPERATURE_SLOTS,
  type MissedTemperature,
  type TemperatureEntryDto,
  type TemperatureSlot,
} from '@sportpit/shared/schemas/fulfillment';
import { addDaysISO, isDateISO, localParts } from '@sportpit/shared/time';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { AppError } from '../system/errors.ts';

/** Вид события в журнале системы, когда замер вне допустимого диапазона. */
export const TEMPERATURE_EVENT = 'temperature_out_of_range';

interface Row {
  fridge_id: string;
  date: string;
  slot: TemperatureSlot;
  celsius: number;
  out_of_range: number;
  recorded_at: string;
}

const toDto = (row: Row): TemperatureEntryDto => ({
  fridgeId: row.fridge_id,
  date: row.date,
  slot: row.slot,
  celsius: row.celsius,
  outOfRange: row.out_of_range === 1,
  recordedAt: row.recorded_at,
});

export interface TemperatureApi {
  /** Записывает замер сегодняшнего дня; повтор того же замера исправляет значение. */
  log(
    fridgeId: string,
    slot: TemperatureSlot,
    celsius: number,
    actorId: number | null,
  ): TemperatureEntryDto;
  /** Замеры холодильника за период (новые первыми). */
  list(fridgeId: string, from: string, to: string): TemperatureEntryDto[];
  /** Замеры холодильника за один день по слотам. */
  forDay(fridgeId: string, date: string): Record<TemperatureSlot, TemperatureEntryDto | null>;
  /** Замеры, срок которых прошёл, а записи нет, по действующим холодильникам. */
  missed(from?: string, to?: string): { from: string; to: string; items: MissedTemperature[] };
}

const hhmm = (at: Date): string => {
  const p = localParts(at);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

export function createTemperatureService(deps: AppDeps): TemperatureApi {
  const { db, clock, system } = deps;
  const admin = adminFor(deps);

  function log(
    fridgeId: string,
    slot: TemperatureSlot,
    celsius: number,
    actorId: number | null,
  ): TemperatureEntryDto {
    if (!admin.getFridge(fridgeId)) {
      throw new AppError(404, 'fridge_not_found', 'fulfillment.error.fridgeNotFound');
    }
    const now = clock.now();
    const date = clock.localDate(now);
    const outOfRange = isOutOfRange(celsius);
    db.run(
      `INSERT INTO temperature_logs (fridge_id, date, slot, celsius, out_of_range, recorded_at, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (fridge_id, date, slot) DO UPDATE SET
         celsius = excluded.celsius, out_of_range = excluded.out_of_range,
         recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by`,
      [fridgeId, date, slot, celsius, outOfRange ? 1 : 0, now.toISOString(), actorId],
    );
    if (outOfRange) system.logEvent(TEMPERATURE_EVENT, { fridgeId, date, slot, celsius });
    return toDto(
      db.get<Row>('SELECT * FROM temperature_logs WHERE fridge_id = ? AND date = ? AND slot = ?', [
        fridgeId,
        date,
        slot,
      ])!,
    );
  }

  function list(fridgeId: string, from: string, to: string): TemperatureEntryDto[] {
    return db
      .query<Row>(
        `SELECT * FROM temperature_logs WHERE fridge_id = ? AND date BETWEEN ? AND ?
          ORDER BY date DESC, slot DESC`,
        [fridgeId, from, to],
      )
      .map(toDto);
  }

  function forDay(fridgeId: string, date: string) {
    const result: Record<TemperatureSlot, TemperatureEntryDto | null> = {
      morning: null,
      evening: null,
    };
    for (const entry of list(fridgeId, date, date)) result[entry.slot] = entry;
    return result;
  }

  function missed(from?: string, to?: string) {
    const now = clock.now();
    const today = clock.localDate(now);
    const end = to ?? today;
    const start = from ?? addDaysISO(end, -(MISSED_DEFAULT_DAYS - 1));
    if (!isDateISO(start) || !isDateISO(end) || start > end) {
      throw new AppError(400, 'bad_range', 'fulfillment.error.range');
    }
    if (addDaysISO(start, MISSED_MAX_DAYS) < end) {
      throw new AppError(400, 'bad_range', 'fulfillment.error.range');
    }
    // Холодильник проверяется со дня создания: замер, срок которого прошёл до создания, не ждали.
    const created = new Map(
      db
        .query<{ id: string; created_at: string }>('SELECT id, created_at FROM fridges')
        .map((r) => [r.id, new Date(r.created_at)]),
    );
    const done = new Set(
      db
        .query<{ fridge_id: string; date: string; slot: string }>(
          'SELECT fridge_id, date, slot FROM temperature_logs WHERE date BETWEEN ? AND ?',
          [start, end],
        )
        .map((r) => `${r.fridge_id}|${r.date}|${r.slot}`),
    );
    const nowTime = hhmm(now);
    const items: MissedTemperature[] = [];
    for (const fridge of admin.listFridges().filter((f) => f.active)) {
      const createdAt = created.get(fridge.id);
      const firstDay = createdAt ? clock.localDate(createdAt) : start;
      for (let date = start > firstDay ? start : firstDay; date <= end && date <= today;) {
        for (const slot of TEMPERATURE_SLOTS) {
          const deadline = TEMPERATURE_DEADLINES[slot];
          const due =
            (date < today || nowTime >= deadline) &&
            !(createdAt && date === firstDay && hhmm(createdAt) >= deadline);
          if (due && !done.has(`${fridge.id}|${date}|${slot}`)) {
            items.push({
              fridgeId: fridge.id,
              fridgeName: fridge.name,
              gymName: fridge.gymName,
              date,
              slot,
            });
          }
        }
        date = addDaysISO(date, 1);
      }
    }
    items.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.fridgeId.localeCompare(b.fridgeId) ||
        TEMPERATURE_SLOTS.indexOf(a.slot) - TEMPERATURE_SLOTS.indexOf(b.slot),
    );
    return { from: start, to: end, items };
  }

  return { log, list, forDay, missed };
}
