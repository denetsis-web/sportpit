import type { Lang } from './i18n.ts';
import { isDateISO, localParts } from './time.ts';

const NBSP = ' ';

/** Деньги: на входе целые бани, на выходе «119 лей» / «129,50 lei» (формат Молдовы). */
export function formatMoney(bani: number, lang: Lang): string {
  if (!Number.isSafeInteger(bani)) {
    throw new RangeError(`Сумма должна быть целым числом бань: ${bani}`);
  }
  const negative = bani < 0;
  const abs = Math.abs(bani);
  const lei = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(lei).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const number = rest === 0 ? grouped : `${grouped},${String(rest).padStart(2, '0')}`;
  const unit = lang === 'ro' ? (lei === 1 && rest === 0 ? 'leu' : 'lei') : 'лей';
  return `${negative ? '-' : ''}${number}${NBSP}${unit}`;
}

function toLocal(iso: string): { dateOnly?: string; parts?: ReturnType<typeof localParts> } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    if (!isDateISO(iso)) throw new RangeError(`Неверная дата: ${iso}`);
    return { dateOnly: iso };
  }
  const at = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(at.getTime())) {
    throw new RangeError(`Неверная дата: ${iso}`);
  }
  return { parts: localParts(at) };
}

const two = (n: number) => String(n).padStart(2, '0');

/** Дата дд.мм.гггг. `YYYY-MM-DD` берётся как есть, момент ISO переводится в Europe/Chisinau. */
export function formatDate(iso: string, _lang: Lang): string {
  const { dateOnly, parts } = toLocal(iso);
  if (dateOnly) {
    const [y, m, d] = dateOnly.split('-');
    return `${d}.${m}.${y}`;
  }
  return `${two(parts!.day)}.${two(parts!.month)}.${parts!.year}`;
}

/** Время чч:мм по Кишинёву из момента ISO. */
export function formatTime(iso: string): string {
  const { parts } = toLocal(iso);
  if (!parts) throw new RangeError(`Нужен момент времени, а не дата: ${iso}`);
  return `${two(parts.hour)}:${two(parts.minute)}`;
}

export function formatDateTime(iso: string, lang: Lang): string {
  return `${formatDate(iso, lang)} ${formatTime(iso)}`;
}
