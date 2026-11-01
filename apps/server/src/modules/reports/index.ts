// Модуль reports: отчёты администратора и выгрузка в CSV. Читает данные других модулей только на чтение.
//   reportsFor(deps).salesReport(range, page?)      — выдано и выручка по залам и пакетам, проданные пакеты;
//   reportsFor(deps).wasteReport(range, page?)      — приготовлено, выдано, списано, процент списаний;
//   reportsFor(deps).ratingsReport(range, page?)    — оценки блюд за период и за всё время;
//   reportsFor(deps).shareReport(range, page?)      — доля зала = процент зала × выручка выданных боксов;
//   reportsFor(deps).retentionReport(range, page?)  — активные клиенты и отток;
//   reportsFor(deps).range(from?, to?)              — период (по умолчанию последние 30 дней);
//   reportsFor(deps).csv(kind, range, lang)         — файл для Excel: UTF-8 с BOM, разделитель «;».
// Без номера страницы отчёт отдаёт все строки; со страницей — по 50.
import type { Lang } from '@sportpit/shared/i18n';
import type {
  RatingsReport,
  ReportKind,
  ReportRange,
  RetentionReport,
  SalesReport,
  ShareReport,
  SystemEventsResponse,
  WasteReport,
} from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { ratingsCsv, retentionCsv, salesCsv, shareCsv, wasteCsv, type CsvFile } from './csv.ts';
import { systemEvents } from './events.ts';
import { ratingsReport } from './ratings.ts';
import { resolveRange } from './range.ts';
import { retentionReport } from './retention.ts';
import { salesReport } from './sales.ts';
import { shareReport } from './share.ts';
import { wasteReport } from './waste.ts';

export { toCsv, leiCell, CSV_BOM, CSV_SEPARATOR } from './csv.ts';
export type { CsvCell, CsvFile, RawCell } from './csv.ts';
export { paginate } from './range.ts';
export { shareOf } from './share.ts';

export interface ReportsApi {
  range(from?: string, to?: string): ReportRange;
  salesReport(range: ReportRange, page?: number): SalesReport;
  wasteReport(range: ReportRange, page?: number): WasteReport;
  ratingsReport(range: ReportRange, page?: number): RatingsReport;
  shareReport(range: ReportRange, page?: number): ShareReport;
  retentionReport(range: ReportRange, page?: number): RetentionReport;
  csv(kind: ReportKind, range: ReportRange, lang: Lang): CsvFile;
  systemEvents(options?: {
    kind?: string | undefined;
    page?: number | undefined;
  }): SystemEventsResponse;
}

const instances = new WeakMap<object, ReportsApi>();

export function reportsFor(deps: AppDeps): ReportsApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const api: ReportsApi = {
    range: (from, to) => resolveRange(deps.clock, from, to),
    salesReport: (range, page) => salesReport(deps, range, page),
    wasteReport: (range, page) => wasteReport(deps, range, page),
    ratingsReport: (range, page) => ratingsReport(deps, range, page),
    shareReport: (range, page) => shareReport(deps, range, page),
    retentionReport: (range, page) => retentionReport(deps, range, page),
    csv(kind, range, lang) {
      switch (kind) {
        case 'sales':
          return salesCsv(api.salesReport(range), lang);
        case 'waste':
          return wasteCsv(api.wasteReport(range), lang);
        case 'ratings':
          return ratingsCsv(api.ratingsReport(range), lang);
        case 'share':
          return shareCsv(api.shareReport(range), lang);
        case 'retention':
          return retentionCsv(api.retentionReport(range), lang);
      }
    },
    systemEvents: (options) => systemEvents(deps, options),
  };
  instances.set(deps, api);
  return api;
}
