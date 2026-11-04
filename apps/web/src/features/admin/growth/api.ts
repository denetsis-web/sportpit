// Запросы листа ожидания и воронки. Весь доступ к серверу — через общий клиент API.
import {
  funnelReportSchema,
  waitlistListSchema,
  type AttributionSource,
} from '@sportpit/shared/schemas/growth';
import { api } from '../../../api/index.ts';

/** Фильтры списка; пустая строка — «без условия». */
export interface WaitlistFilters {
  q: string;
  gym: string;
  goal: string;
  lang: string;
  source: '' | AttributionSource;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: WaitlistFilters = {
  q: '',
  gym: '',
  goal: '',
  lang: '',
  source: '',
  from: '',
  to: '',
};

export const hasFilters = (filters: WaitlistFilters): boolean =>
  Object.values(filters).some((value) => value !== '');

export const fetchWaitlist = (filters: WaitlistFilters, page: number) =>
  api.get('/admin/waitlist', {
    query: {
      q: filters.q.trim() || null,
      gym: filters.gym.trim() || null,
      goal: filters.goal || null,
      lang: filters.lang || null,
      source: filters.source || null,
      from: filters.from || null,
      to: filters.to || null,
      page,
    },
    schema: waitlistListSchema,
  });

export const deleteWaitlistEntry = (id: number) => api.delete<void>(`/admin/waitlist/${id}`);

/** Ссылка на файл для Excel: браузер скачивает его сам, сессия идёт в cookie. Язык заголовков — `labels`. */
export function waitlistCsvUrl(filters: WaitlistFilters, labels: string): string {
  const search = new URLSearchParams();
  const put = (name: string, value: string) => {
    if (value) search.set(name, value);
  };
  put('q', filters.q.trim());
  put('gym', filters.gym.trim());
  put('goal', filters.goal);
  put('lang', filters.lang);
  put('source', filters.source);
  put('from', filters.from);
  put('to', filters.to);
  search.set('labels', labels);
  return `/api/v1/admin/waitlist/csv?${search.toString()}`;
}

/** Пустой период — «по умолчанию» (сервер берёт последние 30 дней). */
export const fetchFunnel = (period: { from: string; to: string }) =>
  api.get('/admin/funnel', {
    query: { from: period.from || null, to: period.to || null },
    schema: funnelReportSchema,
  });
