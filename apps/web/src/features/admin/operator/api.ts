// Запросы оператора выдачи и администратора (пропуски температуры). Весь доступ к серверу — через общий клиент API.
import {
  closeDayResultSchema,
  dayOverviewSchema,
  loadedResponseSchema,
  missedListSchema,
  operatorFridgesSchema,
  pickupResultSchema,
  temperatureResponseSchema,
  type CloseDayBody,
  type TemperatureBody,
} from '@sportpit/shared/schemas/fulfillment';
import { api } from '../../../api/index.ts';

const base = (fridgeId: string) => `/operator/fridges/${encodeURIComponent(fridgeId)}`;

export const fetchFridges = () => api.get('/operator/fridges', { schema: operatorFridgesSchema });

export const fetchDay = (fridgeId: string, date: string | null) =>
  api.get(`${base(fridgeId)}/day`, {
    ...(date ? { query: { date } } : {}),
    schema: dayOverviewSchema,
  });

export const markLoaded = (fridgeId: string, date: string) =>
  api.post(`${base(fridgeId)}/loaded`, { body: { date }, schema: loadedResponseSchema });

export const pickupByCode = (fridgeId: string, date: string, code: string) =>
  api.post(`${base(fridgeId)}/pickup`, { body: { date, code }, schema: pickupResultSchema });

export const closeDay = (fridgeId: string, body: CloseDayBody) =>
  api.post(`${base(fridgeId)}/close-day`, { body, schema: closeDayResultSchema });

export const logTemperature = (fridgeId: string, body: TemperatureBody) =>
  api.post(`${base(fridgeId)}/temperature`, { body, schema: temperatureResponseSchema });

export const fetchMissed = (from: string | null, to: string | null) =>
  api.get('/admin/temperature/missed', {
    query: { from, to },
    schema: missedListSchema,
  });
