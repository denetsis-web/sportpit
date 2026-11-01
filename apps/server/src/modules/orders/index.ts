// Модуль orders: заказы на завтра, сроки, вместимость, коды получения, пауза пакета.
// Другие модули пользуются так (один набор зависимостей — один сервис):
//   ordersFor(deps).transition(orderId, to, actor)        — loaded / picked_up / written_off / cancelled;
//   ordersFor(deps).get(orderId)                           — заказ с позициями и кодом;
//   ordersFor(deps).listByFridgeDate(fridgeId, date)       — заказы холодильника на день (без отменённых);
//   ordersFor(deps).confirmedItemsByDate(date)             — [{fridgeId, dishId, qty}] по подтверждённым и загруженным;
//   ordersFor(deps).findByCode(fridgeId, date, code)       — действующий заказ по коду получения;
//   ordersFor(deps).capacityLeft(fridgeId, date)           — свободные боксы холодильника.
// Статусы и допустимые переходы — в @sportpit/shared/schemas/orders.
// Кредиты кладёт в резерв и возвращает сам модуль (billing.reserve/release); consume вызывает выдача.
import type { AppDeps } from '../../app.ts';
import { createOrdersService, type OrdersApi } from './service.ts';

export { allocateCode } from './store.ts';
export type { ItemTotal, OrderItemRecord, OrderRecord } from './store.ts';
export type { OrderActor, OrdersApi } from './service.ts';

const instances = new WeakMap<object, OrdersApi>();

/** Сервис заказов для приложения. Один на набор зависимостей; при создании подключает занятые порции к меню. */
export function ordersFor(deps: AppDeps): OrdersApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const api = createOrdersService(deps);
  instances.set(deps, api);
  return api;
}
