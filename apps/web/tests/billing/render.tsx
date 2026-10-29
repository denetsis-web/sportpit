// Помощники тестов billing на клиенте: настоящие функции пакетов, оплаты и админки + поддельный сервер.
import { vi } from 'vitest';
import type { PackageDto, PurchaseDto } from '@sportpit/shared/schemas/billing';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { installFakeApi, user, type FakeHandler } from '../auth/fakeApi.ts';
import { renderApp } from '../helpers.tsx';

export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,packages,payment}/routes.tsx'],
  { eager: true },
);
export const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,packages,promos,refunds}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

export function cleanUp(): void {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetSession();
}

export const PACKAGES: PackageDto[] = [
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
    boxes: 20,
    pricePerBoxBani: 10900,
    totalBani: 218000,
    validityDays: 45,
    active: true,
    sortOrder: 20,
  },
  {
    id: 3,
    boxes: 30,
    pricePerBoxBani: 9900,
    totalBani: 297000,
    validityDays: 45,
    active: true,
    sortOrder: 30,
  },
  {
    id: 4,
    boxes: 1,
    pricePerBoxBani: 12900,
    totalBani: 12900,
    validityDays: 45,
    active: true,
    sortOrder: 40,
  },
];

export function purchase(overrides: Partial<PurchaseDto> = {}): PurchaseDto {
  return {
    id: 7,
    status: 'pending',
    failureCode: null,
    failureReason: null,
    packageId: 1,
    boxes: 12,
    listPricePerBoxBani: 11900,
    unitPriceBani: 11900,
    discountBani: 0,
    totalBani: 142800,
    promoCode: null,
    method: 'card',
    redirectUrl: '/pay/stub/7',
    stubGateway: true,
    createdAt: '2026-03-10T09:00:00.000Z',
    paidAt: null,
    expiresAt: null,
    carriedOver: 0,
    ...overrides,
  };
}

export const loggedIn = (role: 'client' | 'admin' = 'client'): Record<string, FakeHandler> => ({
  'GET /auth/me': () => ({ body: { user: user({ role }) } }),
});

export const baseBilling = (
  credits: { balance: number; lots: unknown[] } = { balance: 0, lots: [] },
): Record<string, FakeHandler> => ({
  ...loggedIn(),
  'GET /packages': () => ({ body: { items: PACKAGES } }),
  'GET /credits': () => ({ body: credits }),
  'GET /purchases': () => ({ body: { items: [] } }),
});

export { installFakeApi };
