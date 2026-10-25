// Клиент API: весь доступ к серверу идёт отсюда.
// REST JSON под /api/v1, сессия в HttpOnly-cookie (браузер подставляет её сам),
// запись только с заголовком X-Requested-With, язык ответов — по выбранному языку интерфейса.
import { DEFAULT_LANG, isLang, LANG_STORAGE_KEY } from '@sportpit/shared/i18n';
import type { ApiErrorBody } from '@sportpit/shared/types';

/** Сервер ответил ошибкой (4xx/5xx). `message` уже на языке интерфейса. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly params: Record<string, string | number> | undefined;
  readonly fields: Record<string, string> | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.messageKey = body.messageKey;
    this.params = body.params;
    this.fields = body.fields;
  }
}

/** До сервера не достучались: нет сети, обрыв, таймаут. Ответа нет, сообщение — ключ словаря. */
export class NetworkError extends Error {
  readonly messageKey = 'core.error.network';
  constructor(cause?: unknown) {
    super('core.error.network', { cause });
    this.name = 'NetworkError';
  }
}

export type NetworkStatus = 'unknown' | 'reachable' | 'unreachable';
let networkStatus: NetworkStatus = 'unknown';
const statusListeners = new Set<() => void>();

function setNetworkStatus(next: NetworkStatus): void {
  if (next === networkStatus) return;
  networkStatus = next;
  statusListeners.forEach((listener) => listener());
}

export const getNetworkStatus = (): NetworkStatus => networkStatus;

/** Подписка на «сервер доступен / недоступен» (по результатам реальных запросов). */
export function subscribeNetworkStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions<T = unknown> {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Проверка ответа (например, zod-схема из @sportpit/shared/schemas/*): `parse` бросает при несовпадении. */
  schema?: { parse(data: unknown): T };
}

export interface ApiClient {
  get<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T>;
  post<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T>;
  put<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T>;
  patch<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T>;
  delete<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Язык заголовка Accept-Language; по умолчанию — из localStorage. */
  getLang?: () => string;
}

function storedLang(): string {
  try {
    const value = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(value) ? value : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function withQuery(url: string, query?: Query): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${url}${url.includes('?') ? '&' : '?'}${text}` : url;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const getLang = options.getLang ?? storedLang;

  async function request<T>(
    method: string,
    path: string,
    opts: RequestOptions<T> = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-language': getLang(),
      'x-requested-with': 'sportpit',
      ...opts.headers,
    };
    let body: BodyInit | undefined;
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
      response = await doFetch(withQuery(`${baseUrl}${path}`, opts.query), {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        credentials: 'same-origin',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      setNetworkStatus('unreachable');
      throw new NetworkError(error);
    }
    setNetworkStatus('reachable');

    if (response.status === 204) return undefined as T;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const error = (payload as Partial<ApiErrorBody> | undefined)?.error;
      throw new ApiError(
        response.status,
        error ?? {
          code: 'bad_response',
          messageKey: 'core.error.generic',
          message: 'core.error.generic',
        },
      );
    }
    return opts.schema ? opts.schema.parse(payload) : (payload as T);
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}

/** Клиент по умолчанию: относительные адреса /api/v1 (в разработке Vite проксирует на порт 3000). */
export const api: ApiClient = createApiClient();
