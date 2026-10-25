// Часы проекта. Все сроки считаются по Europe/Chisinau, в базе лежит UTC.
// Код модулей берёт время только отсюда (`deps.clock`), а не из `new Date()`,
// чтобы тесты могли подменить время и проверить сроки, сгорание и закрытие дня.
import { addDaysISO, localDateISO, localToUtc } from '@sportpit/shared/time';

export { TIME_ZONE } from '@sportpit/shared/time';

export interface Clock {
  /** Текущий момент. Каждый вызов возвращает новый объект Date. */
  now(): Date;
  /** Дата `YYYY-MM-DD` по Кишинёву для момента `at` (по умолчанию — сейчас). */
  localDate(at?: Date): string;
  /**
   * Момент UTC, когда закрывается приём заказов на день выдачи `dateISO`:
   * день `dateISO − 1` в `cutoff` (`HH:MM`) по Кишинёву; корректно в дни перевода часов.
   */
  cutoffFor(dateISO: string, cutoff: string): Date;
}

/** Часы для тестов: стоят на месте, пока их не сдвинули. */
export interface ManualClock extends Clock {
  set(at: Date | string): void;
  advance(ms: number): void;
}

function cutoffFor(dateISO: string, cutoff: string): Date {
  return localToUtc(addDaysISO(dateISO, -1), cutoff);
}

export function createSystemClock(): Clock {
  const now = () => new Date();
  return {
    now,
    localDate: (at = now()) => localDateISO(at),
    cutoffFor,
  };
}

export function createManualClock(initial: Date | string = '2026-01-15T10:00:00Z'): ManualClock {
  let current = new Date(initial);
  if (Number.isNaN(current.getTime())) throw new RangeError(`Неверное время: ${String(initial)}`);
  return {
    now: () => new Date(current),
    localDate: (at = new Date(current)) => localDateISO(at),
    cutoffFor,
    set(at) {
      const next = new Date(at);
      if (Number.isNaN(next.getTime())) throw new RangeError(`Неверное время: ${String(at)}`);
      current = next;
    },
    advance(ms) {
      current = new Date(current.getTime() + ms);
    },
  };
}
