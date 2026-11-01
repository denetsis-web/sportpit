// Данные и подключение функций таска 08 (получение бокса, оператор) для тестов экранов.
import type { DayOverview, PickupView } from '@sportpit/shared/schemas/fulfillment';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { user } from '../auth/fakeApi.ts';
import { renderApp } from '../helpers.tsx';

export { apiError, installFakeApi } from '../auth/fakeApi.ts';
export { user };

const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,pickup}/routes.tsx'],
  { eager: true },
);
const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,operator}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

export const cleanUp = (): void => resetSession();

export const NAME_A = { ru: 'Курица с рисом', ro: 'Pui cu orez' };
export const NAME_B = { ru: 'Лосось с овощами', ro: 'Somon cu legume' };

export function pickupView(overrides: Partial<PickupView> = {}): PickupView {
  return {
    orderId: 'ord-1',
    status: 'loaded',
    date: '2026-03-11',
    fridgeId: 'fridge-1',
    fridgeName: 'Холодильник у входа',
    gymName: 'Зал «Тест»',
    pickupFrom: '07:00',
    pickupTo: '22:00',
    code: '4207',
    boxes: 3,
    items: [
      { dishId: 1, qty: 2, name: NAME_A },
      { dishId: 2, qty: 1, name: NAME_B },
    ],
    loaded: true,
    canPickup: true,
    blockedReason: null,
    accessCode: null,
    ...overrides,
  };
}

export function dayOverview(overrides: Partial<DayOverview> = {}): DayOverview {
  return {
    fridge: {
      id: 'fridge-1',
      name: 'Холодильник у входа',
      gymName: 'Зал «Тест»',
      pickupFrom: '07:00',
      pickupTo: '22:00',
    },
    date: '2026-03-11',
    today: '2026-03-11',
    cutoffPassed: true,
    loaded: false,
    loadedAt: null,
    items: [
      {
        dishId: 1,
        name: NAME_A,
        qty: 2,
        batch: { id: 5, code: '260311-D01-1', status: 'cooked' },
        cooked: true,
      },
      {
        dishId: 2,
        name: NAME_B,
        qty: 1,
        batch: { id: 6, code: '260311-D02-1', status: 'cooked' },
        cooked: true,
      },
    ],
    blockedDishes: [],
    orders: [
      {
        id: 'ord-1',
        status: 'confirmed',
        boxes: 3,
        items: [
          { dishId: 1, qty: 2, name: NAME_A },
          { dishId: 2, qty: 1, name: NAME_B },
        ],
      },
    ],
    totals: { boxes: 3, pickedUp: 0, waiting: 3, writtenOff: 0 },
    closure: null,
    temperature: { morning: null, evening: null },
    ...overrides,
  };
}
