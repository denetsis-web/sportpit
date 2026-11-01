// Запросы отчётов и событий системы. Весь доступ к серверу — через общий клиент API.
import {
  ratingsReportSchema,
  retentionReportSchema,
  salesReportSchema,
  shareReportSchema,
  systemEventsSchema,
  wasteReportSchema,
  type ReportKind,
} from '@sportpit/shared/schemas/reports';
import { api } from '../../../api/index.ts';

/** Период и страница таблицы; пустой период — «по умолчанию» (последние 30 дней). */
export interface ReportParams {
  from: string;
  to: string;
  page: number;
}

const query = ({ from, to, page }: ReportParams) => ({
  from: from || null,
  to: to || null,
  page,
});

export const fetchSales = (p: ReportParams) =>
  api.get('/admin/reports/sales', { query: query(p), schema: salesReportSchema });
export const fetchWaste = (p: ReportParams) =>
  api.get('/admin/reports/waste', { query: query(p), schema: wasteReportSchema });
export const fetchRatings = (p: ReportParams) =>
  api.get('/admin/reports/ratings', { query: query(p), schema: ratingsReportSchema });
export const fetchShare = (p: ReportParams) =>
  api.get('/admin/reports/share', { query: query(p), schema: shareReportSchema });
export const fetchRetention = (p: ReportParams) =>
  api.get('/admin/reports/retention', { query: query(p), schema: retentionReportSchema });

/** Ссылка на файл для Excel: браузер скачивает его сам, сессия идёт в cookie. */
export function csvUrl(kind: ReportKind, params: Pick<ReportParams, 'from' | 'to'>, lang: string) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  search.set('lang', lang);
  return `/api/v1/admin/reports/${kind}/csv?${search.toString()}`;
}

export const fetchSystemEvents = (kind: string | null, page: number) =>
  api.get('/admin/system/events', { query: { kind, page }, schema: systemEventsSchema });
