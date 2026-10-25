// Время проекта: в базе UTC, все правила сроков считаются по Europe/Chisinau.
// Здесь живут чистые функции пояса (без системных часов); `Clock` на сервере строится поверх них.

export const TIME_ZONE = 'Europe/Chisinau';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Часы на стене в Кишинёве для момента `at`. */
export function localParts(at: Date): LocalParts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(at)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** Смещение пояса от UTC в миллисекундах для момента `at` (зима +2 ч, лето +3 ч). */
export function zoneOffsetMs(at: Date): number {
  const p = localParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateISO(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function isTimeHHMM(value: string): boolean {
  return TIME_RE.test(value);
}

/** Календарная дата `YYYY-MM-DD` плюс `days` дней (без часовых поясов). */
export function addDaysISO(dateISO: string, days: number): string {
  if (!isDateISO(dateISO)) throw new RangeError(`Неверная дата: ${dateISO}`);
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Дата `YYYY-MM-DD` в Кишинёве для момента `at`. */
export function localDateISO(at: Date): string {
  const p = localParts(at);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Момент UTC, когда в Кишинёве на часах `dateISO` `HH:MM`.
 * Неоднозначное время (осенний перевод, час повторяется) — берётся первое вхождение.
 * Несуществующее время (весенний перевод, час пропадает) — сдвигается вперёд на длину пропуска.
 */
export function localToUtc(dateISO: string, time: string): Date {
  if (!isDateISO(dateISO)) throw new RangeError(`Неверная дата: ${dateISO}`);
  const tm = TIME_RE.exec(time);
  if (!tm) throw new RangeError(`Неверное время: ${time}`);
  const [y, mo, d] = dateISO.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, mo - 1, d, Number(tm[1]), Number(tm[2]));
  const DAY = 24 * 60 * 60 * 1000;
  const offsetBefore = zoneOffsetMs(new Date(naive - DAY));
  const offsetAfter = zoneOffsetMs(new Date(naive + DAY));
  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => naive - offset)
    .filter((utc) => zoneOffsetMs(new Date(utc)) === naive - utc)
    .sort((a, b) => a - b);
  if (candidates.length > 0) return new Date(candidates[0]!);
  return new Date(naive - offsetBefore);
}
