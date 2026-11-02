// Общие данные и подключение функций таска 03 для тестов меню и админки каталога.
import type { DishCardDto, MenuDto, MenuItemDto } from '@sportpit/shared/schemas/catalog';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { renderApp } from '../helpers.tsx';

export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,menu}/routes.tsx'],
  { eager: true },
);
export const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,gyms,fridges,dishes,menu,settings}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

export const TODAY = '2026-03-10';
export const TOMORROW = '2026-03-11';
const NOTE = {
  ru: 'Допуск КБЖУ: ±5% по белку',
  ro: 'Toleranță valori nutriționale: ±5% la proteine',
};

export function item(overrides: Partial<MenuItemDto> = {}): MenuItemDto {
  return {
    id: 1,
    name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
    composition: { ru: 'куриная грудка, рис, брокколи', ro: 'piept de pui, orez, broccoli' },
    calories: 520,
    proteinG: 42.5,
    fatG: 14,
    carbsG: 55,
    fiberG: 6,
    weightG: 380,
    allergens: ['gluten'],
    goals: ['maintain'],
    vegetarian: false,
    shelfLifeHours: 72,
    photoUrl: '/api/v1/files/dishes/1-abc.jpg',
    rating: { avg: null, count: 0 },
    portionsLeft: 5,
    soldOut: false,
    cookedAt: null,
    ...overrides,
  };
}

export function menu(overrides: Partial<MenuDto> = {}): MenuDto {
  return {
    date: TOMORROW,
    today: TODAY,
    published: true,
    nextDate: null,
    items: [item()],
    toleranceNote: NOTE,
    ...overrides,
  };
}

export function card(overrides: Partial<DishCardDto> = {}): DishCardDto {
  return {
    dish: { ...item(), onMenu: true },
    reviews: [],
    today: TODAY,
    toleranceNote: NOTE,
    ...overrides,
  };
}
