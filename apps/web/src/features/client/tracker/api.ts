// Запросы трекера питания. Весь доступ к серверу идёт через общий клиент API.
import {
  entryResponseSchema,
  trackerDaySchema,
  trackerWeekSchema,
  type EntryInput,
  type EntryPatch,
} from '@sportpit/shared/schemas/tracker';
import { api } from '../../../api/index.ts';

export const fetchDay = (date?: string) =>
  api.get('/tracker/day', { query: { date }, schema: trackerDaySchema });

export const fetchWeek = (date?: string) =>
  api.get('/tracker/week', { query: { date }, schema: trackerWeekSchema });

export const createEntry = (input: EntryInput) =>
  api.post('/tracker/entries', { body: input, schema: entryResponseSchema });

export const updateEntry = (id: number, patch: EntryPatch) =>
  api.patch(`/tracker/entries/${id}`, { body: patch, schema: entryResponseSchema });

export const removeEntry = (id: number) => api.delete(`/tracker/entries/${id}`);
