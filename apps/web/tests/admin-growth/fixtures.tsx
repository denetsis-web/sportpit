// Данные и подключение экранов «Лист ожидания» и «Воронка» для тестов.
import type { FunnelReport, FunnelRow, WaitlistList } from '@sportpit/shared/schemas/growth';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import { user, type FakeHandler } from '../auth/fakeApi.ts';
import { renderApp } from '../helpers.tsx';

export { apiError } from '../auth/fakeApi.ts';

/** Поддельный сервер: как installFakeApi, но умеет ответ 204 без тела (удаление записи). */
export function installFakeApi(routes: Record<string, FakeHandler>) {
  const calls: Array<{ method: string; path: string; query: URLSearchParams; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.pathname.replace(/^\/api\/v1/, '');
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, query: url.searchParams, body });
      const handler = routes[`${method} ${path}`];
      const out = handler
        ? await handler({ method, path, query: url.searchParams, body, headers: {} })
        : {
            status: 404,
            body: { error: { code: 'not_found', messageKey: 'core.error.notFound', message: 'x' } },
          };
      const status = out.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(out.body ?? {}), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return {
    calls,
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/auth/routes.tsx'],
  { eager: true },
);
const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,growth}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

/** Сначала снимаем экран, потом сбрасываем вход: иначе живой экран успевает заново спросить `/auth/me`. */
export const cleanUp = (): void => {
  cleanup();
  resetSession();
};

export const as = (role: 'admin' | 'operator' | 'kitchen' | 'client') => ({
  'GET /auth/me': () => ({ body: { user: user({ role }) } }),
});

export const entry = (over: Partial<WaitlistList['items'][number]> = {}) => ({
  id: 1,
  phone: '+37360111222',
  name: 'Ион',
  gym: 'Зал на Ботанике',
  goal: 'lose' as const,
  lang: 'ru' as const,
  source: 'gym' as const,
  ref: 'qr-botanica',
  campaign: 'launch',
  createdAt: '2026-11-03T10:30:00.000Z',
  path: { usedCalc: true, signedUp: true, purchased: false },
  ...over,
});

export const list = (over: Partial<WaitlistList> = {}): WaitlistList => ({
  items: [
    entry(),
    entry({
      id: 2,
      phone: '+37360333444',
      name: null,
      gym: null,
      goal: null,
      lang: 'ro',
      source: 'tg',
      ref: null,
      campaign: null,
      path: null,
    }),
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  ...over,
});

const zero = (source: FunnelRow['source']): FunnelRow => ({
  source,
  landingViews: 0,
  calcUsed: 0,
  waitlistJoins: 0,
  signups: 0,
  firstPurchases: 0,
  unique: { visitors: 0, calc: 0, waitlist: 0, signups: 0, purchases: 0 },
});

export const emptyFunnel = (): FunnelReport => ({
  from: '2026-10-05',
  to: '2026-11-04',
  rows: [...(['gym', 'trainer', 'tg', 'ig', 'direct', 'other'] as const), 'total' as const].map(
    zero,
  ),
});

/** Зал (и «Всего»): 200 просмотров, 50 расчётов, 10 записей, 5 регистраций, 1 покупка; остальные источники пустые. */
export const funnel = (): FunnelReport => {
  const report = emptyFunnel();
  const gym: FunnelRow = {
    source: 'gym',
    landingViews: 200,
    calcUsed: 50,
    waitlistJoins: 10,
    signups: 5,
    firstPurchases: 1,
    unique: { visitors: 120, calc: 40, waitlist: 8, signups: 4, purchases: 1 },
  };
  return {
    ...report,
    rows: report.rows.map((r) =>
      r.source === 'gym' || r.source === 'total' ? { ...gym, source: r.source } : r,
    ),
  };
};
