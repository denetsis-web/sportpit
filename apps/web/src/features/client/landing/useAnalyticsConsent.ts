import { useSyncExternalStore } from 'react';
import { getAnalyticsConsent, subscribeConsent, type AnalyticsConsent } from './tracker.ts';

/** Выбор посетителя по аналитике: `null` — ещё не выбирал. Меняется сразу во всех местах страницы. */
export function useAnalyticsConsent(): AnalyticsConsent | null {
  return useSyncExternalStore(subscribeConsent, getAnalyticsConsent, () => null);
}
