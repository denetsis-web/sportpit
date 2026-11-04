import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import { installFakeApi, user as makeUser, type FakeHandler } from '../auth/fakeApi.ts';
import { renderApp } from '../helpers.tsx';

// Настоящие функции клиента, которые связаны с лендингом: главная, лендинг, вход.
export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{home,landing,auth}/routes.tsx'],
  { eager: true },
);

const dish = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: { ru: `Курица с рисом ${id}`, ro: `Pui cu orez ${id}` },
  composition: { ru: 'курица, рис', ro: 'pui, orez' },
  calories: 520,
  proteinG: 42,
  fatG: 14.5,
  carbsG: 55,
  fiberG: 6,
  weightG: 380,
  allergens: [],
  goals: [],
  vegetarian: false,
  shelfLifeHours: 72,
  photoUrl: null,
  rating: { avg: null, count: 0 },
  portionsLeft: 10,
  soldOut: false,
  cookedAt: null,
  ...over,
});

export const menuBody = (
  items = [dish(1), dish(2, { photoUrl: '/api/v1/files/dishes/a.jpg' })],
) => ({
  date: '2026-11-05',
  today: '2026-11-04',
  published: true,
  nextDate: null,
  items,
  toleranceNote: { ru: '', ro: '' },
});

export const unpublishedMenu = {
  date: '2026-11-05',
  today: '2026-11-04',
  published: false,
  nextDate: '2026-11-07',
  items: [],
  toleranceNote: { ru: '', ro: '' },
};

export const packagesBody = {
  items: [
    {
      id: 1,
      boxes: 12,
      pricePerBoxBani: 11900,
      totalBani: 142800,
      validityDays: 45,
      active: true,
      sortOrder: 10,
    },
    {
      id: 2,
      boxes: 1,
      pricePerBoxBani: 12900,
      totalBani: 12900,
      validityDays: 45,
      active: true,
      sortOrder: 40,
    },
  ],
};

export const publicSettings = {
  maxBoxesPerDay: 3,
  toleranceNote: { ru: 'Допуск КБЖУ: ±5% по белку', ro: 'Toleranță: ±5% la proteine' },
  supportContacts: { phone: '[ВПИШИ]', email: '[ВПИШИ]', messenger: '[ВПИШИ]' },
};

/** Поддельный сервер гостя: меню, пакеты, настройки, события — все работают. */
export function serve(routes: Record<string, FakeHandler> = {}, signedIn = false) {
  return installFakeApi({
    'GET /auth/me': () => ({ body: { user: signedIn ? makeUser() : null } }),
    'GET /menu': () => ({ body: menuBody() }),
    'GET /packages': () => ({ body: packagesBody }),
    'GET /settings/public': () => ({ body: publicSettings }),
    'POST /track': () => ({ body: {} }),
    ...routes,
  });
}

export function open(path: string, lang: 'ru' | 'ro' | null = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules: {} }, { lang });
}

export function cleanUp(): void {
  // сначала снимаем экран: иначе смонтированные компоненты начнут новую проверку входа на настоящем fetch
  cleanup();
  vi.unstubAllGlobals();
  resetSession();
  window.sessionStorage.clear();
}
