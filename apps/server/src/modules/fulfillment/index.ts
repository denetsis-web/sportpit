// Модуль fulfillment: загрузка холодильников, выдача, закрытие дня, списания, температура.
// Другие модули пользуются так (один набор зависимостей — один сервис):
//   fulfillmentFor(deps).markLoaded(fridgeId, date, actorId)       — «загружено»: заказы холодильника → loaded;
//   fulfillmentFor(deps).pickupByClient(userId, orderId)           — «Забрал» (окно выдачи, после загрузки);
//   fulfillmentFor(deps).pickupByCode(fridgeId, date, code, actor) — выдача по коду клиента, повтор безопасен;
//   fulfillmentFor(deps).closeDay(fridgeId, {date, remaining, ...}, actor) — остаток и списание невыданных;
//   fulfillmentFor(deps).closeDue()                                — автозакрытие (задача по расписанию);
//   fulfillmentFor(deps).logTemperature(fridgeId, slot, celsius, actorId);
//   fulfillmentFor(deps).writeOffTotals(from, to)                  — [{date, fridgeId, dishId|null, reason, qty}] для отчётов.
// Выдача вызывает billing.consume в одной транзакции с переходом в picked_up; списание кредит не возвращает.
import type { AppDeps } from '../../app.ts';
import { createFulfillmentService, type FulfillmentApi } from './service.ts';

export { AUTO_CLOSE_TIME } from './service.ts';
export { TEMPERATURE_EVENT } from './temperature.ts';
export type { FulfillmentApi } from './service.ts';
export type { WriteOffTotalRow } from '@sportpit/shared/schemas/fulfillment';

const instances = new WeakMap<object, FulfillmentApi>();

/** Сервис выдачи для приложения. Один на набор зависимостей. */
export function fulfillmentFor(deps: AppDeps): FulfillmentApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const api = createFulfillmentService(deps);
  instances.set(deps, api);
  return api;
}
