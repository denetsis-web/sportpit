// Период отчёта и постраничный вывод: общие для всех отчётов.
import {
  REPORT_DEFAULT_DAYS,
  REPORT_MAX_DAYS,
  REPORT_PAGE_SIZE,
  type PageInfo,
  type ReportRange,
} from '@sportpit/shared/schemas/reports';
import { addDaysISO, isDateISO, localToUtc } from '@sportpit/shared/time';
import type { Clock } from '../clock/index.ts';
import { AppError } from '../system/errors.ts';

const badRange = () => new AppError(400, 'bad_range', 'reports.error.range');

/** Период: даты по Кишинёву, обе границы включительно. Без дат — последние 30 дней до сегодня. */
export function resolveRange(clock: Clock, from?: string, to?: string): ReportRange {
  const end = to ?? clock.localDate();
  const start = from ?? addDaysISO(end, -(REPORT_DEFAULT_DAYS - 1));
  if (!isDateISO(start) || !isDateISO(end) || start > end) throw badRange();
  if (addDaysISO(start, REPORT_MAX_DAYS) < end) throw badRange();
  return { from: start, to: end };
}

/** Все даты периода по порядку. */
export function datesOf(range: ReportRange): string[] {
  const out: string[] = [];
  for (let day = range.from; day <= range.to; day = addDaysISO(day, 1)) out.push(day);
  return out;
}

/** Число дней в периоде (обе границы входят). */
export function daysIn(range: ReportRange): number {
  return datesOf(range).length;
}

/** Предыдущий период той же длины, вплотную перед текущим. */
export function previousRange(range: ReportRange): ReportRange {
  const length = daysIn(range);
  return { from: addDaysISO(range.from, -length), to: addDaysISO(range.from, -1) };
}

/** Границы периода в UTC для полей-моментов: `[from 00:00, to+1 00:00)` по Кишинёву. */
export function utcBounds(range: ReportRange): { start: string; end: string } {
  return {
    start: localToUtc(range.from, '00:00').toISOString(),
    end: localToUtc(addDaysISO(range.to, 1), '00:00').toISOString(),
  };
}

/** Страница списка. Без номера страницы отдаются все строки (для выгрузки). */
export function paginate<T>(rows: readonly T[], page?: number): { rows: T[]; page: PageInfo } {
  const total = rows.length;
  if (page === undefined) {
    return { rows: [...rows], page: { number: 1, size: Math.max(total, 1), total, pages: 1 } };
  }
  const pages = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
  const start = (page - 1) * REPORT_PAGE_SIZE;
  return {
    rows: rows.slice(start, start + REPORT_PAGE_SIZE),
    page: { number: page, size: REPORT_PAGE_SIZE, total, pages },
  };
}

/** Процент с одним знаком после запятой; `null`, если делить не на что. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}
