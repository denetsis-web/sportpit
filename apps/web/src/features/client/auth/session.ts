// Состояние входа на клиенте: кто вошёл. Один общий «магазин» на всё приложение
// (клиентские экраны, колокольчик, админка), без провайдера: подписка через useSyncExternalStore.
// Сессия живёт в HttpOnly-cookie, JavaScript её не видит: о входе узнаём запросом GET /auth/me.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { meResponseSchema, type AuthUserDto } from '@sportpit/shared/schemas/auth';
import { api, NetworkError } from '../../../api/index.ts';
import { onLangChange } from '../../../app/i18n.tsx';

export interface SessionState {
  /** loading — ещё не спрашивали сервер; ready — ответ получен (или сервер недоступен). */
  status: 'loading' | 'ready';
  user: AuthUserDto | null;
}

const INITIAL: SessionState = { status: 'loading', user: null };
let state: SessionState = INITIAL;
let inFlight: Promise<void> | undefined;
/** Растёт при сбросе (тесты): запоздавший ответ прежнего состояния отбрасывается. */
let generation = 0;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getSession = (): SessionState => state;

/** Спрашивает сервер, кто вошёл. Без сети остаётся последнее известное состояние. */
export function refreshSession(): Promise<void> {
  const started = generation;
  inFlight ??= api
    .get('/auth/me', { schema: meResponseSchema })
    .then(({ user }) => {
      if (started === generation) setState({ status: 'ready', user });
    })
    .catch((error: unknown) => {
      if (!(error instanceof NetworkError)) throw error;
      if (started === generation) setState({ ...state, status: 'ready' });
    })
    .finally(() => {
      if (started === generation) inFlight = undefined;
    });
  return inFlight;
}

export function setSessionUser(user: AuthUserDto | null): void {
  setState({ status: 'ready', user });
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    setSessionUser(null);
  }
}

/** Только для тестов. */
export function resetSession(): void {
  generation += 1;
  inFlight = undefined;
  setState(INITIAL);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Состояние входа; при первом использовании само запрашивает сервер. */
export function useSession(): SessionState & { refresh: () => Promise<void> } {
  const current = useSyncExternalStore(subscribe, getSession, getSession);
  useEffect(() => {
    if (getSession().status === 'loading') void refreshSession().catch(() => undefined);
  }, []);
  const refresh = useCallback(() => refreshSession(), []);
  return { ...current, refresh };
}

// Выбранный язык сохраняется в профиле вошедшего пользователя (R14).
onLangChange((lang) => {
  const { user } = getSession();
  if (!user || user.lang === lang) return;
  setState({ ...state, user: { ...user, lang } });
  void api.patch('/auth/me', { body: { lang } }).catch(() => undefined);
});
