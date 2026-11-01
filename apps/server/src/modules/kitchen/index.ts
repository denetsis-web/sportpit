// Модуль kitchen: сводка производства, партии, этикетки. Другие модули пользуются так:
//   kitchenFor(deps).productionSummary(date)          — порции по блюдам и холодильникам, запас, партии;
//   kitchenFor(deps).batchesFor(fridgeId, date)       — партии для загрузки холодильника (таск 08);
//   kitchenFor(deps).markCooked(batchId, actorId?)    — партия приготовлена, время и «съесть до» сохранены;
//   kitchenFor(deps).cookedTotals(from, to)           — приготовлено и списано по блюдам и холодильникам (отчёты);
//   kitchenFor(deps).labelData(batchId)               — данные этикетки.
// При создании сервис сообщает каталогу время приготовления партии (карточка меню «приготовлено в …»).
import type { AppDeps } from '../../app.ts';
import { createKitchenService, type KitchenApi } from './service.ts';

export { batchCode, bufferFor } from './service.ts';
export type {
  BatchDto,
  CookedTotalRow,
  FridgeBatchDto,
  KitchenApi,
  LabelData,
  ProductionSummary,
} from './service.ts';

const instances = new WeakMap<object, KitchenApi>();

/** Сервис кухни для приложения. Один на набор зависимостей. */
export function kitchenFor(deps: AppDeps): KitchenApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const api = createKitchenService(deps);
  instances.set(deps, api);
  return api;
}
