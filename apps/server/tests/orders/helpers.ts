// Помощники тестов заказов: приложение с залом, холодильником, тремя блюдами, меню на несколько дней
// и клиентом с оплаченным пакетом. Всё идёт через HTTP API, как у настоящего клиента.
import type { AppDeps } from '../../src/app.ts';
import { createFridge, createGym } from '../admin/helpers.ts';
import {
  addClient,
  buyPaid,
  call,
  makeBillingApp,
  newKey,
  type BillingTest,
} from '../billing/helpers.ts';
import { createDish, setMenu } from '../catalog/helpers.ts';

export { addClient, buyPaid, call, newKey };

export interface OrdersTest extends BillingTest {
  gymId: string;
  fridgeId: string;
  /** Три блюда: A, B, C. */
  dishes: [number, number, number];
  deps: AppDeps;
}

export const TODAY = '2026-03-10';
export const TOMORROW = '2026-03-11';
export const DAY2 = '2026-03-12';
export const DAY3 = '2026-03-13';

export interface OrdersAppOptions {
  /** Начало времени (UTC). По умолчанию 10 марта 2026, 12:00 по Кишинёву. */
  start?: string;
  capacity?: number;
  cutoffTime?: string;
  /** Лимит порций каждого блюда на каждый день меню. */
  portions?: number;
  /** Боксов в пакете клиента (0 — без покупки). */
  credits?: number;
  /** Дни, на которые публикуется меню. */
  menuDates?: string[];
}

export async function makeOrdersApp(options: OrdersAppOptions = {}): Promise<OrdersTest> {
  const test = await makeBillingApp({ start: options.start ?? '2026-03-10T09:00:00Z' });
  const gym = await createGym(test);
  const fridge = await createFridge(test, gym.id, {
    capacityBoxes: options.capacity ?? 40,
    ...(options.cutoffTime ? { cutoffTime: options.cutoffTime } : {}),
  });
  const a = await createDish(test, { nameRu: 'Курица с рисом', nameRo: 'Pui cu orez' });
  const b = await createDish(test, {
    nameRu: 'Лосось с овощами',
    nameRo: 'Somon cu legume',
    calories: 480,
  });
  const c = await createDish(test, {
    nameRu: 'Овсянка с ягодами',
    nameRo: 'Terci cu fructe',
    calories: 350,
  });
  const dishes: [number, number, number] = [a.id, b.id, c.id];
  for (const date of options.menuDates ?? [TOMORROW, DAY2, DAY3]) {
    await setMenu(
      test,
      date,
      dishes.map((dishId) => ({ dishId, portionLimit: options.portions ?? 30 })),
    );
  }
  const credits = options.credits ?? 12;
  if (credits > 0) await buyPaid(test, test.client, credits);
  return { ...test, gymId: gym.id, fridgeId: fridge.id, dishes, deps: test.app.deps };
}

export interface OrderBody {
  fridgeId?: string;
  date?: string;
  items?: Array<{ dishId: number; qty: number }>;
  idempotencyKey?: string;
}

/** Тело подтверждения: по умолчанию один бокс блюда A на завтра. */
export function orderBody(test: OrdersTest, overrides: OrderBody = {}) {
  return {
    fridgeId: overrides.fridgeId ?? test.fridgeId,
    date: overrides.date ?? TOMORROW,
    items: overrides.items ?? [{ dishId: test.dishes[0], qty: 1 }],
    idempotencyKey: overrides.idempotencyKey ?? newKey(),
  };
}

export function placeOrder(
  test: OrdersTest,
  cookie: string = test.client,
  overrides: OrderBody = {},
  headers: Record<string, string> = {},
) {
  return call(test, 'POST', '/orders', cookie, orderBody(test, overrides), headers);
}

export interface PlacedOrder {
  id: string;
  status: string;
  code: string | null;
  date: string;
  boxes: number;
  fridgeId: string;
}

/** Подтверждает заказ и требует успеха. */
export async function placeOk(
  test: OrdersTest,
  cookie: string = test.client,
  overrides: OrderBody = {},
): Promise<PlacedOrder> {
  const res = await placeOrder(test, cookie, overrides);
  if (res.statusCode !== 201) throw new Error(`Заказ не создан: ${res.statusCode} ${res.body}`);
  return res.json().order;
}

export const rows = <T = Record<string, unknown>>(
  test: OrdersTest,
  sql: string,
  params: Array<string | number> = [],
) => test.deps.db.query<T>(sql, params);

export const orderCount = (test: OrdersTest): number =>
  test.deps.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM orders')!.n;

/** Остаток порций блюда в меню дня (то, что видит клиент). */
export async function portionsLeft(
  test: OrdersTest,
  date: string,
  dishId: number,
): Promise<number> {
  const res = await call(test, 'GET', `/menu?date=${date}`);
  const item = (res.json().items as Array<{ id: number; portionsLeft: number }>).find(
    (i) => i.id === dishId,
  );
  return item?.portionsLeft ?? -1;
}

/** Сумма журнала: баланс клиента. */
export const balanceOf = async (test: OrdersTest, cookie: string = test.client): Promise<number> =>
  (await call(test, 'GET', '/credits', cookie)).json().balance;

export const DAY_MS = 24 * 60 * 60 * 1000;
