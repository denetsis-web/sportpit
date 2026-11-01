// Запросы клиента к заказам. Весь доступ к серверу идёт через общий клиент API; ответы проверяются схемами.
import { publicFridgeListSchema } from '@sportpit/shared/schemas/admin';
import { balanceResponseSchema } from '@sportpit/shared/schemas/billing';
import { menuSchema } from '@sportpit/shared/schemas/catalog';
import { profileResponseSchema } from '@sportpit/shared/schemas/profile';
import {
  availabilitySchema,
  confirmedResponseSchema,
  moveResponseSchema,
  orderResponseSchema,
  type ConfirmOrderInput,
} from '@sportpit/shared/schemas/orders';
import { api } from '../../../api/index.ts';

export const fetchFridges = () => api.get('/fridges', { schema: publicFridgeListSchema });
export const fetchMenu = (date?: string) =>
  api.get('/menu', { query: { date }, schema: menuSchema });
export const fetchAvailability = (fridgeId: string, date: string) =>
  api.get('/orders/availability', { query: { fridgeId, date }, schema: availabilitySchema });
export const fetchCredits = () => api.get('/credits', { schema: balanceResponseSchema });
export const fetchProfile = () => api.get('/profile', { schema: profileResponseSchema });
export const fetchOrder = (id: string) =>
  api.get(`/orders/${encodeURIComponent(id)}`, { schema: orderResponseSchema });

export const confirmOrder = (input: ConfirmOrderInput) =>
  api.post('/orders', { body: input, schema: confirmedResponseSchema });
export const moveOrder = (id: string, input: ConfirmOrderInput) =>
  api.post(`/orders/${encodeURIComponent(id)}/move`, { body: input, schema: moveResponseSchema });
