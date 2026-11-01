// Запросы получения бокса. Весь доступ к серверу идёт через общий клиент API.
import { clientPickupResultSchema, pickupListSchema } from '@sportpit/shared/schemas/fulfillment';
import { api } from '../../../api/index.ts';

export const fetchPickupOrders = () => api.get('/pickup/orders', { schema: pickupListSchema });

export const pickUp = (orderId: string) =>
  api.post(`/pickup/orders/${encodeURIComponent(orderId)}/pickup`, {
    schema: clientPickupResultSchema,
  });
