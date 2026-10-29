// Запросы клиента к billing. Весь доступ к серверу идёт через общий клиент API; ответы проверяются схемами.
import {
  balanceResponseSchema,
  packagesResponseSchema,
  promoApplyResponseSchema,
  purchaseResponseSchema,
  purchasesResponseSchema,
  type PaymentMethod,
} from '@sportpit/shared/schemas/billing';
import { api } from '../../../api/index.ts';

export const fetchPackages = () => api.get('/packages', { schema: packagesResponseSchema });
export const fetchCredits = () => api.get('/credits', { schema: balanceResponseSchema });
export const fetchPurchases = () => api.get('/purchases', { schema: purchasesResponseSchema });
export const fetchPurchase = (id: number) =>
  api.get(`/purchases/${id}`, { schema: purchaseResponseSchema });

export const applyPromo = (code: string, packageId?: number) =>
  api.post('/promo/apply', {
    body: { code, ...(packageId !== undefined ? { packageId } : {}) },
    schema: promoApplyResponseSchema,
  });

export const startPurchase = (input: {
  packageId: number;
  method: PaymentMethod;
  promoCode?: string;
  idempotencyKey: string;
}) => api.post('/purchases', { body: input, schema: purchaseResponseSchema });

export const cancelPurchase = (id: number) =>
  api.post(`/purchases/${id}/cancel`, { schema: purchaseResponseSchema });

export const stubPay = (id: number, outcome: 'paid' | 'failed') =>
  api.post(`/purchases/${id}/stub-pay`, { body: { outcome }, schema: purchaseResponseSchema });

/** Ключ попытки оплаты: одно нажатие «Купить» = один ключ, повтор после сбоя сети идёт с тем же. */
export function newAttemptKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
