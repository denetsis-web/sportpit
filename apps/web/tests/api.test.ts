import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createApiClient,
  getNetworkStatus,
  NetworkError,
  subscribeNetworkStatus,
} from '../src/api/index.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('клиент API', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GET: адрес /api/v1, query без пустых значений, язык и заголовок записи', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const api = createApiClient({ fetch: fetchMock, getLang: () => 'ro' });
    const out = await api.get<{ ok: boolean }>('/menu', {
      query: { date: '2026-10-26', protein: 30, vegan: false, skip: undefined, none: null },
    });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/menu?date=2026-10-26&protein=30&vegan=false');
    expect(init.method).toBe('GET');
    expect(init.headers['accept-language']).toBe('ro');
    expect(init.headers['x-requested-with']).toBe('sportpit');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
  });

  it('POST: тело отправляется JSON-ом', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 7 }));
    const api = createApiClient({ fetch: fetchMock });
    await api.post('/orders', { body: { dishId: 1, qty: 2 } });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ dishId: 1, qty: 2 });
  });

  it('ответ 204 даёт undefined', async () => {
    const api = createApiClient({
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    });
    expect(await api.delete('/orders/1')).toBeUndefined();
  });

  it('ошибка сервера превращается в ApiError с кодом, статусом и текстом на языке запроса', async () => {
    const api = createApiClient({
      fetch: vi.fn().mockResolvedValue(
        jsonResponse(403, {
          error: { code: 'forbidden', messageKey: 'core.error.forbidden', message: 'Нет доступа.' },
        }),
      ),
    });
    const error = await api.get('/admin/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'forbidden',
      messageKey: 'core.error.forbidden',
      message: 'Нет доступа.',
    });
  });

  it('ответ-не-JSON с кодом ошибки — всё равно ApiError', async () => {
    const api = createApiClient({
      fetch: vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 502 })),
    });
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, code: 'bad_response' });
  });

  it('нет сети: NetworkError, статус «недоступен», подписчики уведомлены; успешный ответ возвращает «доступен»', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, {}));
    const api = createApiClient({ fetch: fetchMock });
    const seen: string[] = [];
    const off = subscribeNetworkStatus(() => seen.push(getNetworkStatus()));

    const error = await api.get('/menu').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).messageKey).toBe('core.error.network');
    expect(getNetworkStatus()).toBe('unreachable');

    await api.get('/menu');
    expect(getNetworkStatus()).toBe('reachable');
    expect(seen).toEqual(['unreachable', 'reachable']);
    off();
  });

  it('схема проверяет ответ: несоответствие — ошибка', async () => {
    const api = createApiClient({
      fetch: vi.fn().mockResolvedValue(jsonResponse(200, { n: 'не число' })),
    });
    const schema = {
      parse(data: unknown): { n: number } {
        if (typeof (data as { n?: unknown }).n !== 'number') throw new Error('схема: n не число');
        return data as { n: number };
      },
    };
    await expect(api.get('/x', { schema })).rejects.toThrow('схема');
  });

  it('отмена запроса не считается потерей связи', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const api = createApiClient({ fetch: fetchMock });
    const before = getNetworkStatus();
    const pending = api.get('/slow', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(getNetworkStatus()).toBe(before);
  });
});
