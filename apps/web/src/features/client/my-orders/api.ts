// Запросы «Моих заказов» и паузы пакета. Весь доступ к серверу идёт через общий клиент API.
import { balanceResponseSchema } from '@sportpit/shared/schemas/billing';
import {
  orderResponseSchema,
  ordersListSchema,
  pauseResponseSchema,
  pausesResponseSchema,
  type PauseCreate,
} from '@sportpit/shared/schemas/orders';
import { api } from '../../../api/index.ts';

export const fetchOrders = () => api.get('/orders', { schema: ordersListSchema });
export const fetchCredits = () => api.get('/credits', { schema: balanceResponseSchema });
export const fetchPauses = () => api.get('/pauses', { schema: pausesResponseSchema });

export const cancelOrder = (id: string) =>
  api.post(`/orders/${encodeURIComponent(id)}/cancel`, { schema: orderResponseSchema });

export const pauseLot = (input: PauseCreate) =>
  api.post('/pauses', { body: input, schema: pauseResponseSchema });
