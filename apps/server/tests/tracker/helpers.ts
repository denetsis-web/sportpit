// Помощники тестов трекера: клиент с выданным заказом, анкета с нормой, ручные записи.
import { ordersFor } from '../../src/modules/orders/index.ts';
import { call, makeOrdersApp, placeOk, type OrdersTest } from '../orders/helpers.ts';
import { SAMPLE, setHealthConsent } from '../profile/helpers.ts';

export { call, makeOrdersApp, placeOk, SAMPLE };
export type { OrdersTest };

/** Норма клиента из SAMPLE (разбор вручную в packages/shared/tests/targets.test.ts). */
export const SAMPLE_TARGET = {
  calories: 2345,
  proteinG: 160,
  fatG: 65,
  carbsG: 280,
  fiberG: 33,
};

/** Блюдо A из помощника заказов: 520 ккал, белок 42, жиры 14, углеводы 55, клетчатка 6. */
export const DISH_A = { calories: 520, proteinG: 42, fatG: 14, carbsG: 55, fiberG: 6 };

/** Переводит заказ в «выдан» (confirmed → loaded → picked_up). */
export function pickUp(test: OrdersTest, orderId: string): void {
  const orders = ordersFor(test.deps);
  orders.transition(orderId, 'loaded', { kind: 'system' });
  orders.transition(orderId, 'picked_up', { kind: 'system' });
}

export async function fillProfile(
  test: OrdersTest,
  cookie: string = test.client,
  profile: Record<string, unknown> = SAMPLE,
): Promise<void> {
  const consent = await setHealthConsent(test, cookie);
  if (consent.statusCode !== 200) throw new Error(`Согласие не записано: ${consent.body}`);
  const saved = await call(test, 'PUT', '/profile', cookie, profile);
  if (saved.statusCode !== 200) throw new Error(`Анкета не сохранена: ${saved.body}`);
}

export const ENTRY = {
  date: '2026-03-11',
  name: 'Греческий йогурт',
  calories: 150,
  proteinG: 15,
  fatG: 4,
  carbsG: 12,
  fiberG: 0,
};

export async function addEntry(
  test: OrdersTest,
  cookie: string = test.client,
  overrides: Record<string, unknown> = {},
) {
  const res = await call(test, 'POST', '/tracker/entries', cookie, { ...ENTRY, ...overrides });
  if (res.statusCode !== 201) throw new Error(`Запись не создана: ${res.statusCode} ${res.body}`);
  return res.json().entry as { id: number } & typeof ENTRY;
}
