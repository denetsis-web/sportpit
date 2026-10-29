// Поддельный сервер для тестов админки каталога: как tests/auth/fakeApi.ts, но понимает загрузку файла (FormData).
import { vi } from 'vitest';

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  form: FormData | undefined;
}
export interface FakeResponse {
  status?: number;
  body?: unknown;
}
export type FakeHandler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;

export const admin = { 'GET /auth/me': () => ({ body: { user: adminUser() } }) };

export function adminUser(role: 'admin' | 'client' = 'admin') {
  return { id: 1, phone: '+37360123456', role, lang: 'ru', fridgeIds: [] };
}

export function installFake(routes: Record<string, FakeHandler>) {
  const calls: FakeRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const form = init?.body instanceof FormData ? init.body : undefined;
    const request: FakeRequest = {
      method,
      path,
      query: url.searchParams,
      body: init?.body && !form ? JSON.parse(String(init.body)) : undefined,
      form,
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

export function fail(
  status: number,
  code: string,
  messageKey: string,
  fields?: Record<string, string>,
  params?: Record<string, string | number>,
): FakeResponse {
  return {
    status,
    body: { error: { code, messageKey, message: `[server] ${messageKey}`, fields, params } },
  };
}
