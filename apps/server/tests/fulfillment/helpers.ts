// Помощники тестов выдачи: приложение кухни плюс оператор, привязанный к холодильнику,
// и «день с заказами»: заказ накануне, закрытие приёма, готовые партии, загрузка.
// Время: приложение стартует 10 марта 2026, 11:00 по Кишинёву (UTC+2); срок приёма заказов на 11 марта —
// 10 марта 18:00 (16:00 UTC); окно выдачи по умолчанию 07:00–22:00 (05:00–20:00 UTC).
import { authFor } from '../../src/modules/auth/index.ts';
import { login, setRole, userId } from '../auth/helpers.ts';
import {
  call,
  clientWithCredits,
  CUTOFF_UTC,
  makeKitchenApp,
  OPERATOR_PHONE,
  placeOk,
  runCloseJob,
  summary,
  TOMORROW,
  type KitchenTest,
} from '../kitchen/helpers.ts';
import type { OrdersAppOptions } from '../orders/helpers.ts';

export { call, clientWithCredits, CUTOFF_UTC, OPERATOR_PHONE, placeOk, TOMORROW };
export type { KitchenTest };

export const OTHER_OPERATOR_PHONE = '+37360555003';
export const THIRD_CLIENT_PHONE = '+37360555102';

/** Утро дня выдачи 11 марта: 07:30 по Кишинёву. */
export const PICKUP_MORNING = '2026-03-11T05:30:00Z';
/** Вечер того же дня: 22:30 по Кишинёву (окно выдачи закрыто). */
export const PICKUP_NIGHT = '2026-03-11T20:30:00Z';

export interface FulfillmentTest extends KitchenTest {
  /** Cookie оператора, у которого есть только основной холодильник. */
  operator: string;
  operatorId: number;
}

export async function makeFulfillmentApp(options: OrdersAppOptions = {}): Promise<FulfillmentTest> {
  const test = await makeKitchenApp(options);
  const operator = await login(test, OPERATOR_PHONE);
  setRole(test.app, OPERATOR_PHONE, 'operator');
  const operatorId = userId(test.app, OPERATOR_PHONE);
  authFor(test.app.deps).setOperatorFridges(operatorId, [test.fridgeId]);
  return { ...test, operator, operatorId };
}

/** Закрывает приём заказов на завтра и фиксирует сводку кухни. */
export async function closeIntake(test: FulfillmentTest): Promise<void> {
  test.clock.set(CUTOFF_UTC);
  await runCloseJob(test);
}

/** Партии всех блюд даты подтверждены и приготовлены кухней. */
export async function cookAll(test: FulfillmentTest, date: string = TOMORROW): Promise<void> {
  const s = await summary(test, date);
  for (const dish of s.dishes) {
    const batch = dish.batch!;
    await call(test, 'POST', `/kitchen/batches/${batch.id}/confirm`, test.kitchen);
    await call(test, 'POST', `/kitchen/batches/${batch.id}/cooked`, test.kitchen);
  }
}

export const loadBody = (date: string = TOMORROW) => ({ date });

export const markLoaded = (
  test: FulfillmentTest,
  cookie: string = test.operator,
  fridgeId: string = test.fridgeId,
  date: string = TOMORROW,
) => call(test, 'POST', `/operator/fridges/${fridgeId}/loaded`, cookie, loadBody(date));

export const pickupByCode = (
  test: FulfillmentTest,
  code: string,
  cookie: string = test.operator,
  fridgeId: string = test.fridgeId,
  date: string = TOMORROW,
) => call(test, 'POST', `/operator/fridges/${fridgeId}/pickup`, cookie, { date, code });

export const dayOf = (
  test: FulfillmentTest,
  cookie: string = test.operator,
  fridgeId: string = test.fridgeId,
  date: string = TOMORROW,
) => call(test, 'GET', `/operator/fridges/${fridgeId}/day?date=${date}`, cookie);

export interface PlacedDay {
  orderId: string;
  code: string;
}

/** Клиент заказал два бокса блюда A и один блюда B на завтра; приём закрыт, партии готовы, холодильник загружен. */
export async function loadedDay(
  test: FulfillmentTest,
  options: { load?: boolean } = {},
): Promise<PlacedDay> {
  const [a, b] = test.dishes;
  const order = await placeOk(test, test.client, {
    items: [
      { dishId: a, qty: 2 },
      { dishId: b, qty: 1 },
    ],
  });
  await closeIntake(test);
  await cookAll(test);
  if (options.load !== false) {
    const res = await markLoaded(test);
    if (res.statusCode !== 200) throw new Error(`Не загружено: ${res.statusCode} ${res.body}`);
  }
  return { orderId: order.id, code: order.code! };
}

export const statusOf = (test: FulfillmentTest, orderId: string): string =>
  test.app.deps.db.get<{ status: string }>('SELECT status FROM orders WHERE id = ?', [orderId])!
    .status;

export { userId };
