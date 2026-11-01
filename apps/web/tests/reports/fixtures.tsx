// Данные и подключение отчётов и страницы «События системы» для тестов экранов.
import type {
  RatingsReport,
  RetentionReport,
  SalesReport,
  ShareReport,
  SystemEventsResponse,
  WasteReport,
} from '@sportpit/shared/schemas/reports';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { user } from '../auth/fakeApi.ts';
import { renderApp } from '../helpers.tsx';

export { apiError, installFakeApi } from '../auth/fakeApi.ts';
export { user };

const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/auth/routes.tsx'],
  { eager: true },
);
const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,reports,system-events}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

export const cleanUp = (): void => resetSession();

export const as = (role: 'admin' | 'operator' | 'client') => ({
  'GET /auth/me': () => ({ body: { user: user({ role }) } }),
});

const range = { from: '2026-03-01', to: '2026-03-31' };
const page = { number: 1, size: 50, total: 3, pages: 1 };

export const sales = (overrides: Partial<SalesReport> = {}): SalesReport => ({
  range,
  totals: { orders: 3, boxes: 6, revenueBani: 66400 },
  rows: [
    { gymId: 'g2', gymName: 'Зал «Север»', packageBoxes: 30, boxes: 2, revenueBani: 19800 },
    { gymId: 'g1', gymName: 'Зал «Тест»', packageBoxes: 12, boxes: 3, revenueBani: 35700 },
    { gymId: 'g1', gymName: 'Зал «Тест»', packageBoxes: null, boxes: 1, revenueBani: 0 },
  ],
  purchases: [{ packageBoxes: 12, count: 3, totalBani: 428400 }],
  daily: [
    { date: '2026-03-10', boxes: 0, revenueBani: 0 },
    { date: '2026-03-11', boxes: 6, revenueBani: 66400 },
  ],
  page,
  ...overrides,
});

export const waste = (): WasteReport => ({
  range,
  totals: { cooked: 7, delivered: 6, writtenOff: 2, wastePercent: 28.6 },
  rows: [
    {
      dishId: 2,
      name: { ru: 'Лосось с овощами', ro: 'Somon cu legume' },
      cooked: 3,
      delivered: 3,
      writtenOff: 1,
      wastePercent: 33.3,
    },
    { dishId: null, name: null, cooked: 0, delivered: 0, writtenOff: 1, wastePercent: null },
  ],
  byFridge: [
    {
      fridgeId: 'f1',
      fridgeName: 'Холодильник у входа',
      gymName: 'Зал «Тест»',
      cooked: 5,
      delivered: 4,
      writtenOff: 2,
      wastePercent: 40,
    },
    {
      fridgeId: null,
      fridgeName: null,
      gymName: null,
      cooked: 5,
      delivered: 0,
      writtenOff: 0,
      wastePercent: 0,
    },
  ],
  byReason: [
    { reason: 'defect', qty: 1 },
    { reason: 'not_picked_up', qty: 1 },
  ],
  daily: [{ date: '2026-03-11', delivered: 6, writtenOff: 2 }],
  page: { ...page, total: 2 },
});

export const ratings = (): RatingsReport => ({
  range,
  totals: { ratings: 3, avg: 4 },
  rows: [
    {
      dishId: 1,
      name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
      count: 2,
      avg: 4.5,
      allTimeAvg: 4.25,
      allTimeCount: 8,
    },
  ],
  page: { ...page, total: 1 },
});

export const share = (): ShareReport => ({
  range,
  totals: { boxes: 6, revenueBani: 66400, shareBani: 7805 },
  rows: [
    {
      gymId: 'g1',
      gymName: 'Зал «Тест»',
      sharePercent: 12.5,
      boxes: 4,
      revenueBani: 46600,
      shareBani: 5825,
    },
  ],
  page: { ...page, total: 1 },
});

export const retention = (): RetentionReport => ({
  range,
  previous: { from: '2026-01-29', to: '2026-02-28' },
  totals: {
    active: 3,
    previousActive: 3,
    retained: 1,
    fresh: 2,
    churned: 2,
    churnPercent: 66.7,
  },
  rows: [{ gymId: 'g1', gymName: 'Зал «Тест»', active: 2, previousActive: 2, churned: 1 }],
  page: { ...page, total: 1 },
});

export const events = (overrides: Partial<SystemEventsResponse> = {}): SystemEventsResponse => ({
  counts24h: { payment_failed: 1, sms_failed: 3 },
  alertKinds: ['sms_failed', 'payment_failed'],
  alertThreshold: 3,
  missedTemperature: 4,
  items: [
    {
      id: 7,
      createdAt: '2026-03-11T10:30:00.000Z',
      kind: 'sms_failed',
      detail: { provider: 'stub', to: '+373***56', message: 'провайдер ответил 500' },
    },
    {
      id: 6,
      createdAt: '2026-03-11T09:00:00.000Z',
      kind: 'payment_failed',
      detail: { operation: 'createPayment', message: 'таймаут шлюза' },
    },
  ],
  page: { number: 1, size: 50, total: 2, pages: 1 },
  ...overrides,
});
