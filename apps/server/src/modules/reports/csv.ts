// Выгрузка отчётов в CSV для Excel (R37.1): UTF-8 с BOM, разделитель «;», перевод строки CRLF,
// числа с десятичной запятой и без разделителей тысяч (так их читает Excel с русской и румынской локалью).
import { t, type Lang } from '@sportpit/shared/i18n';
import type {
  RatingsReport,
  ReportKind,
  RetentionReport,
  SalesReport,
  ShareReport,
  WasteReport,
} from '@sportpit/shared/schemas/reports';

/** Число, уже записанное готовой строкой (деньги в леях): в кавычки и защиту от формул не попадает. */
export interface RawCell {
  raw: string;
}
export type CsvCell = string | number | null | RawCell;

export const CSV_BOM = '﻿';
export const CSV_SEPARATOR = ';';

/** Деньги для Excel: бани → «1290,50» (лей, две цифры после запятой). */
export function leiCell(bani: number): RawCell {
  const sign = bani < 0 ? '-' : '';
  const abs = Math.abs(bani);
  return { raw: `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}` };
}

const isRaw = (cell: CsvCell): cell is RawCell =>
  typeof cell === 'object' && cell !== null && 'raw' in cell;

// Ячейка, начинающаяся с этих знаков, в Excel считается формулой: перед текстом ставим апостроф.
const FORMULA_START = /^[=+\-@\t\r]/;

function formatCell(cell: CsvCell): string {
  if (cell === null) return '';
  if (isRaw(cell)) return cell.raw;
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return '';
    return Number.isInteger(cell) ? String(cell) : String(cell).replace('.', ',');
  }
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Собирает файл: BOM, заголовок и строки. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(formatCell).join(CSV_SEPARATOR));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

export interface CsvFile {
  filename: string;
  body: string;
}

const percentText = (value: number): string => String(value).replace('.', ',');

export function salesCsv(report: SalesReport, lang: Lang): CsvFile {
  const label = (key: string) => t(lang, `reports.csv.${key}`);
  const rows: CsvCell[][] = report.rows.map((row) => [
    row.gymName,
    row.packageBoxes ?? label('noPackage'),
    row.boxes,
    leiCell(row.revenueBani),
  ]);
  rows.push([label('total'), null, report.totals.boxes, leiCell(report.totals.revenueBani)]);
  return {
    filename: fileName('sales', report.range),
    body: toCsv([label('gym'), label('package'), label('boxes'), label('revenue')], rows),
  };
}

export function wasteCsv(report: WasteReport, lang: Lang): CsvFile {
  const label = (key: string) => t(lang, `reports.csv.${key}`);
  const rows: CsvCell[][] = report.rows.map((row) => [
    row.name ? row.name[lang] : label('noDish'),
    row.cooked,
    row.delivered,
    row.writtenOff,
    row.wastePercent,
  ]);
  const { totals } = report;
  rows.push([
    label('total'),
    totals.cooked,
    totals.delivered,
    totals.writtenOff,
    totals.wastePercent,
  ]);
  return {
    filename: fileName('waste', report.range),
    body: toCsv(
      [
        label('dish'),
        label('cooked'),
        label('delivered'),
        label('writtenOff'),
        label('wastePercent'),
      ],
      rows,
    ),
  };
}

export function ratingsCsv(report: RatingsReport, lang: Lang): CsvFile {
  const label = (key: string) => t(lang, `reports.csv.${key}`);
  const rows: CsvCell[][] = report.rows.map((row) => [
    row.name[lang],
    row.count,
    row.avg,
    row.allTimeAvg,
    row.allTimeCount,
  ]);
  rows.push([label('total'), report.totals.ratings, report.totals.avg, null, null]);
  return {
    filename: fileName('ratings', report.range),
    body: toCsv(
      [label('dish'), label('ratings'), label('avg'), label('allTimeAvg'), label('allTimeCount')],
      rows,
    ),
  };
}

export function shareCsv(report: ShareReport, lang: Lang): CsvFile {
  const label = (key: string) => t(lang, `reports.csv.${key}`);
  const formula = (percent: number, revenue: number, share: number): string =>
    t(lang, 'reports.csv.formulaValue', {
      percent: percentText(percent),
      revenue: leiCell(revenue).raw,
      share: leiCell(share).raw,
    });
  const rows: CsvCell[][] = report.rows.map((row) => [
    row.gymName,
    row.sharePercent,
    row.boxes,
    leiCell(row.revenueBani),
    leiCell(row.shareBani),
    formula(row.sharePercent, row.revenueBani, row.shareBani),
  ]);
  const { totals } = report;
  rows.push([
    label('total'),
    null,
    totals.boxes,
    leiCell(totals.revenueBani),
    leiCell(totals.shareBani),
    null,
  ]);
  return {
    filename: fileName('share', report.range),
    body: toCsv(
      [
        label('gym'),
        label('sharePercent'),
        label('boxes'),
        label('revenue'),
        label('share'),
        label('formula'),
      ],
      rows,
    ),
  };
}

export function retentionCsv(report: RetentionReport, lang: Lang): CsvFile {
  const label = (key: string) => t(lang, `reports.csv.${key}`);
  const rows: CsvCell[][] = report.rows.map((row) => [
    row.gymName,
    row.active,
    row.previousActive,
    row.churned,
  ]);
  const { totals } = report;
  rows.push([label('total'), totals.active, totals.previousActive, totals.churned]);
  return {
    filename: fileName('retention', report.range),
    body: toCsv([label('gym'), label('active'), label('previousActive'), label('churned')], rows),
  };
}

function fileName(kind: ReportKind, range: { from: string; to: string }): string {
  return `sportpit-${kind}-${range.from}_${range.to}.csv`;
}
