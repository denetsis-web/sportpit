// Поддельный сервер для тестов входа, уведомлений и каркаса админки: подменяет fetch.
import { vi } from 'vitest';
import type { AuthUserDto } from '@sportpit/shared/schemas/auth';

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}
export interface FakeResponse {
  status?: number;
  body?: unknown;
}
export type FakeHandler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;

export function apiError(
  status: number,
  code: string,
  messageKey: string,
  params?: Record<string, string | number>,
  fields?: Record<string, string>,
): FakeResponse {
  return {
    status,
    body: { error: { code, messageKey, message: `[server] ${messageKey}`, params, fields } },
  };
}

export const user = (overrides: Partial<AuthUserDto> = {}): AuthUserDto => ({
  id: 1,
  phone: '+37360123456',
  role: 'client',
  lang: 'ru',
  fridgeIds: [],
  ...overrides,
});

export const grantedConsents = (granted: Record<string, boolean> = {}) => ({
  items: (['terms', 'privacy', 'health_data'] as const).map((kind) => ({
    kind,
    version: '2026-10-25',
    granted: granted[kind] ?? false,
    decidedVersion: granted[kind] ? '2026-10-25' : null,
    decidedAt: granted[kind] ? '2026-03-10T09:00:00.000Z' : null,
  })),
});

/** Ключ маршрута: «METHOD /путь» без префикса /api/v1. */
export function installFakeApi(routes: Record<string, FakeHandler>) {
  const calls: FakeRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const request: FakeRequest = {
      method,
      path,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(request);
    const handler = routes[`${method} ${path}`];
    const out = handler
      ? await handler(request)
      : {
          status: 404,
          body: { error: { code: 'not_found', messageKey: 'core.error.notFound', message: 'x' } },
        };
    return new Response(JSON.stringify(out.body ?? {}), {
      status: out.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}
