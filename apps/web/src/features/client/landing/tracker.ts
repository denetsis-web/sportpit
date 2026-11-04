// Источник привлечения, согласие на аналитику и отправка событий лендинга. Без React.
// Правила: без согласия постоянного идентификатора нет (в `localStorage` ничего не создаётся);
// после согласия хранится анонимный UUID `sportpit.aid`. Все обращения к хранилищу — в try/catch.
// Файл входит в начальный набор (его использует вход), поэтому тяжёлых зависимостей здесь нет.
import { ATTRIBUTION_SOURCES, type Attribution } from '@sportpit/shared/schemas/auth';
import type { TrackKind } from '@sportpit/shared/schemas/growth';
import { sendTrack } from './api.ts';

export const ANON_ID_KEY = 'sportpit.aid';
export const CONSENT_KEY = 'sportpit.analytics';
export const SOURCE_KEY = 'sportpit.src';
/** Адреса, для которых в этой вкладке просмотр уже отправлен. */
const VIEWS_KEY = 'sportpit.lv';

export type AnalyticsConsent = 'yes' | 'no';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface Stores {
  local?: StorageLike | null;
  session?: StorageLike | null;
}

const LABEL = /^[a-z0-9_-]{1,40}$/;
const URL_SOURCES = ['gym', 'trainer', 'tg', 'ig'] as const;

function localStore(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
function read(store: StorageLike | null | undefined, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}
function write(store: StorageLike | null | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // хранилище недоступно: значение живёт до перезагрузки
  }
}
function remove(store: StorageLike | null | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // хранилище недоступно
  }
}

// ---- источник из адреса ----

interface StoredSource {
  source: Attribution['source'];
  ref?: string;
  campaign?: string;
}

function label(value: string | null): string | undefined {
  const clean = value?.trim().toLowerCase();
  return clean && LABEL.test(clean) ? clean : undefined;
}

function sourceFromUtm(utm: string): Attribution['source'] {
  if (utm.includes('telegram') || utm.includes('t.me') || utm === 'tg') return 'tg';
  if (utm.includes('instagram') || utm === 'ig') return 'ig';
  return 'other';
}

/** Разбор адреса по правилам спецификации; `null` — в адресе нет ни одного нужного параметра. */
function parseSource(url: string): StoredSource | null {
  let params: URLSearchParams;
  try {
    params = new URL(url, 'http://localhost').searchParams;
  } catch {
    return null;
  }
  const src = params.get('src')?.trim().toLowerCase() ?? '';
  const utm = params.get('utm_source')?.trim().toLowerCase() ?? '';
  const ref = label(params.get('ref'));
  const campaign = label(params.get('utm_campaign'));
  if (!src && !utm && params.get('ref') === null && params.get('utm_campaign') === null) {
    return null;
  }
  const source: Attribution['source'] = (URL_SOURCES as readonly string[]).includes(src)
    ? (src as Attribution['source'])
    : utm
      ? sourceFromUtm(utm)
      : 'direct';
  return { source, ...(ref ? { ref } : {}), ...(campaign ? { campaign } : {}) };
}

function readSource(store: StorageLike | null | undefined): StoredSource | null {
  const raw = read(store, SOURCE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const source = value['source'];
    if (
      typeof source !== 'string' ||
      !(ATTRIBUTION_SOURCES as readonly string[]).includes(source)
    ) {
      return null;
    }
    const ref = typeof value['ref'] === 'string' ? label(value['ref']) : undefined;
    const campaign = typeof value['campaign'] === 'string' ? label(value['campaign']) : undefined;
    return {
      source: source as Attribution['source'],
      ...(ref ? { ref } : {}),
      ...(campaign ? { campaign } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Разбирает источник из адреса и запоминает его: всегда в `sessionStorage`, при согласии — и в `localStorage`.
 * Адрес без нужных параметров ранее сохранённый источник не затирает. Возвращает действующую атрибуцию.
 */
export function captureAttribution(url: string, stores: Stores = {}): Attribution {
  const session = stores.session === undefined ? sessionStore() : stores.session;
  const local = stores.local === undefined ? localStore() : stores.local;
  const found = parseSource(url);
  if (found) {
    const json = JSON.stringify(found);
    write(session, SOURCE_KEY, json);
    if (read(local, CONSENT_KEY) === 'yes') write(local, SOURCE_KEY, json);
  }
  return getAttribution(stores);
}

// ---- согласие ----

const consentListeners = new Set<() => void>();

export function getAnalyticsConsent(): AnalyticsConsent | null {
  const value = read(localStore(), CONSENT_KEY);
  return value === 'yes' || value === 'no' ? value : null;
}

/** Подписка на смену выбора (для `useSyncExternalStore`). */
export function subscribeConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => {
    consentListeners.delete(listener);
  };
}

function newUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureAnonId(local: StorageLike | null | undefined): string | undefined {
  const existing = read(local, ANON_ID_KEY);
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const created = newUuid();
  write(local, ANON_ID_KEY, created);
  // не удалось сохранить — номера не будет, иначе каждый визит стал бы «новым человеком»
  return read(local, ANON_ID_KEY) === created ? created : undefined;
}

/** Запоминает выбор. «yes» создаёт анонимный номер; «no» стирает номер и сохранённый источник. */
export function setAnalyticsConsent(value: AnalyticsConsent): void {
  const local = localStore();
  write(local, CONSENT_KEY, value);
  if (value === 'yes') {
    ensureAnonId(local);
    const current = readSource(sessionStore());
    if (current) write(local, SOURCE_KEY, JSON.stringify(current));
  } else {
    remove(local, ANON_ID_KEY);
    remove(local, SOURCE_KEY);
  }
  consentListeners.forEach((listener) => listener());
}

// ---- атрибуция для событий, листа ожидания и входа ----

export function getAttribution(stores: Stores = {}): Attribution {
  const session = stores.session === undefined ? sessionStore() : stores.session;
  const local = stores.local === undefined ? localStore() : stores.local;
  const consent = read(local, CONSENT_KEY) === 'yes';
  const stored = readSource(session) ?? (consent ? readSource(local) : null);
  const anonId = consent ? ensureAnonId(local) : undefined;
  return {
    source: stored?.source ?? 'direct',
    ...(stored?.ref ? { ref: stored.ref } : {}),
    ...(stored?.campaign ? { campaign: stored.campaign } : {}),
    ...(anonId ? { anonId } : {}),
  };
}

/** Атрибуция для входа: `undefined`, когда передавать нечего (сервер сам запишет `direct`). */
export function getSignupAttribution(): Attribution | undefined {
  const attribution = getAttribution();
  const empty =
    attribution.source === 'direct' &&
    !attribution.ref &&
    !attribution.campaign &&
    !attribution.anonId;
  return empty ? undefined : attribution;
}

// ---- события ----

/** Отправляет событие; сбой сети страницу не ломает. */
export async function track(kind: TrackKind): Promise<void> {
  try {
    await sendTrack(kind, getAttribution());
  } catch {
    // аналитика необязательна
  }
}

/** Просмотр страницы: один раз за вкладку на адрес. */
export function trackLandingView(path: string): void {
  const session = sessionStore();
  let seen: string[] = [];
  try {
    const parsed: unknown = JSON.parse(read(session, VIEWS_KEY) ?? '[]');
    if (Array.isArray(parsed)) seen = parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    seen = [];
  }
  if (seen.includes(path)) return;
  write(session, VIEWS_KEY, JSON.stringify([...seen, path]));
  void track('landing_view');
}
