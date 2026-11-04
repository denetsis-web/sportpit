// Цель, которую калькулятор передаёт форме листа ожидания. Живёт только в памяти страницы:
// в хранилища браузера не пишется, при перезагрузке исчезает.
import { useSyncExternalStore } from 'react';
import type { Goal } from '@sportpit/shared/targets';

interface Prefill {
  goal: Goal | null;
  /** Растёт при каждой передаче, чтобы форма подставила цель и повторно (после правки поля руками). */
  version: number;
}

const EMPTY: Prefill = { goal: null, version: 0 };
let current: Prefill = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Калькулятор передаёт цель из расчёта. */
export function prefillGoal(goal: Goal): void {
  current = { goal, version: current.version + 1 };
  emit();
}

/** Сброс (для тестов и выхода со страницы). */
export function resetPrefill(): void {
  current = EMPTY;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrefill(): Prefill {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}
