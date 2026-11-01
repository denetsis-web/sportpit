// Данные и подключение функций таска 06 для тестов экрана заказа и «Мои заказы».
import type { PublicFridgeDto } from '@sportpit/shared/schemas/admin';
import type { MenuItemDto } from '@sportpit/shared/schemas/catalog';
import type { Availability, OrderDto } from '@sportpit/shared/schemas/orders';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { user, type FakeHandler } from '../auth/fakeApi.ts';
import { item, menu } from '../menu/fixtures.tsx';
import { renderApp } from '../helpers.tsx';

export { installFakeApi, apiError } from '../auth/fakeApi.ts';
export { TODAY, TOMORROW } from '../menu/fixtures.tsx';

export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,menu,order,my-orders,packages}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules: {} }, { lang });
}

export function cleanUp(): void {
  resetSession();
}

export const FRIDGE: PublicFridgeDto = {
  id: 'fridge-1',
  gymId: 'gym-1',
  gymName: 'Зал «Тест»',
  name: 'Холодильник у входа',
  capacityBoxes: 40,
  cutoffTime: '18:00',
  pickupFrom: '07:00',
  pickupTo: '22:00',
};

export const OTHER_FRIDGE: PublicFridgeDto = {
  ...FRIDGE,
  id: 'fridge-2',
  name: 'Холодильник у бассейна',
};

export const DISH_A: MenuItemDto = item({ id: 1, portionsLeft: 5 });
export const DISH_B: MenuItemDto = item({
  id: 2,
  name: { ru: 'Лосось с овощами', ro: 'Somon cu legume' },
  calories: 480,
  proteinG: 38,
  fatG: 22,
  carbsG: 20,
  fiberG: 5,
  portionsLeft: 0,
  soldOut: true,
});
export const DISH_C: MenuItemDto = item({
  id: 3,
  name: { ru: 'Овсянка с ягодами', ro: 'Terci cu fructe' },
  calories: 350,
  proteinG: 12,
  fatG: 8,
  carbsG: 55,
  fiberG: 7,
  portionsLeft: 5,
});

export function availability(overrides: Partial<Availability> = {}): Availability {
  return {
    fridgeId: FRIDGE.id,
    date: '2026-03-11',
    capacityBoxes: 40,
    boxesLeft: 12,
    cutoffTime: '18:00',
    cutoffAt: '2026-03-10T16:00:00.000Z',
    closedReason: null,
    maxBoxesPerDay: 3,
    userBoxes: 0,
    ...overrides,
  };
}

export function orderDto(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 'ord-1',
    status: 'confirmed',
    date: '2026-03-11',
    fridgeId: FRIDGE.id,
    fridgeName: FRIDGE.name,
    gymName: FRIDGE.gymName,
    code: '4821',
    boxes: 2,
    items: [
      {
        dishId: 1,
        qty: 2,
        name: DISH_A.name,
        calories: 520,
        proteinG: 42.5,
        fatG: 14,
        carbsG: 55,
        fiberG: 6,
      },
    ],
    createdAt: '2026-03-10T09:00:00.000Z',
    cutoffAt: '2026-03-10T16:00:00.000Z',
    canChange: true,
    pickupFrom: '07:00',
    pickupTo: '22:00',
    ...overrides,
  };
}

export const TARGETS = {
  kcal: 2345,
  proteinG: 160,
  proteinRangeG: { min: 128, max: 176 },
  fatG: 65,
  carbG: 260,
  fiberG: 33,
  floorApplied: false,
};

export const LOT = {
  id: 7,
  source: 'purchase' as const,
  remaining: 10,
  unitPriceBani: 11900,
  createdAt: '2026-03-01T09:00:00.000Z',
  expiresAt: '2026-04-15T09:00:00.000Z',
};

/** Вошедший клиент, холодильник, меню на завтра, свободные места и 12 кредитов. */
export function orderApi(extra: Record<string, FakeHandler> = {}): Record<string, FakeHandler> {
  return {
    'GET /auth/me': () => ({ body: { user: user({ role: 'client' }) } }),
    'GET /fridges': () => ({ body: { items: [FRIDGE, OTHER_FRIDGE] } }),
    'GET /menu': () => ({ body: menu({ items: [DISH_A, DISH_B, DISH_C] }) }),
    'GET /orders/availability': () => ({ body: availability() }),
    'GET /credits': () => ({ body: { balance: 12, lots: [{ ...LOT, remaining: 12 }] } }),
    'GET /profile': () => ({
      body: { profile: null, targets: TARGETS, healthConsent: true },
    }),
    ...extra,
  };
}
