// Помощники тестов кухни: приложение с заказами (залы, холодильник, три блюда, клиент с пакетом),
// вход пользователя с ролью «кухня», второй холодильник и несколько клиентов.
import { login, OTHER_PHONE, PHONE, setRole, userId } from '../auth/helpers.ts';
import { createFridge } from '../admin/helpers.ts';
import {
  addClient,
  buyPaid,
  call,
  DAY2,
  makeOrdersApp,
  placeOk,
  TOMORROW,
} from '../orders/helpers.ts';
import type { OrdersAppOptions, OrdersTest } from '../orders/helpers.ts';

export { addClient, buyPaid, call, DAY2, placeOk, TOMORROW };
export { OTHER_PHONE, PHONE };

export const KITCHEN_PHONE = '+37360555001';
export const OPERATOR_PHONE = '+37360555002';

export interface KitchenTest extends OrdersTest {
  /** Cookie пользователя с ролью «кухня». */
  kitchen: string;
  kitchenId: number;
}

export async function makeKitchenApp(options: OrdersAppOptions = {}): Promise<KitchenTest> {
  const test = await makeOrdersApp(options);
  const kitchen = await login(test, KITCHEN_PHONE);
  setRole(test.app, KITCHEN_PHONE, 'kitchen');
  return { ...test, kitchen, kitchenId: userId(test.app, KITCHEN_PHONE) };
}

/** Второй холодильник в том же зале. */
export async function addFridge(
  test: KitchenTest,
  body: Record<string, unknown> = {},
): Promise<string> {
  const fridge = await createFridge(test, test.gymId, {
    name: 'Холодильник у раздевалки',
    ...body,
  });
  return fridge.id;
}

/** Ещё один клиент с пакетом боксов. */
export async function clientWithCredits(
  test: KitchenTest,
  phone: string,
  boxes = 12,
): Promise<string> {
  const { cookie } = await addClient(test, phone);
  await buyPaid(test, cookie, boxes);
  return cookie;
}

export const summaryOf = (test: KitchenTest, date: string, cookie: string = test.kitchen) =>
  call(test, 'GET', `/kitchen/summary?date=${date}`, cookie);

/** Срок приёма заказов на TOMORROW (10 марта 2026 в 18:00 по Кишинёву = 16:00 UTC). */
export const CUTOFF_UTC = '2026-03-10T16:00:00Z';

export interface Summary {
  date: string;
  closed: boolean;
  bufferPercent: number;
  fridges: Array<{
    id: string;
    boxes: number;
    closed: boolean;
    closedAt: string | null;
    cutoffAt: string;
  }>;
  dishes: Array<{
    dishId: number;
    planned: number;
    buffer: number;
    total: number;
    fridges: Array<{ fridgeId: string; qty: number }>;
    batch: null | {
      id: number;
      dishId: number;
      code: string;
      status: 'planned' | 'confirmed' | 'cooked';
      plannedQty: number;
      bufferQty: number;
      totalQty: number;
      confirmedAt: string | null;
      cookedAt: string | null;
      eatBy: string | null;
    };
  }>;
  totals: { planned: number; buffer: number; total: number };
}

export async function summary(test: KitchenTest, date: string = TOMORROW): Promise<Summary> {
  const res = await summaryOf(test, date);
  if (res.statusCode !== 200) throw new Error(`Сводка не получена: ${res.statusCode} ${res.body}`);
  return res.json() as Summary;
}

export const runCloseJob = (test: KitchenTest) =>
  test.app.deps.system.scheduler.runNow('kitchen-close');
