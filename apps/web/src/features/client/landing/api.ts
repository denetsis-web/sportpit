// Запросы лендинга к серверу. Всё идёт через общий клиент API (заголовок X-Requested-With ставит он).
// Схемы ответов не подключаем: файл тянет вход (tracker.ts), а он в начальном наборе.
import type { Attribution } from '@sportpit/shared/schemas/auth';
import type { TrackKind, WaitlistJoin } from '@sportpit/shared/schemas/growth';
import { api } from '../../../api/index.ts';

/** Записывает человека в лист ожидания. Ответ всегда `{ ok: true }`: сервер не выдаёт, что номер уже есть. */
export const joinWaitlist = (input: WaitlistJoin) =>
  api.post<{ ok: true }>('/waitlist', { body: input });

/** Событие воронки без персональных данных; сервер отвечает 204. */
export const sendTrack = (kind: TrackKind, attribution: Attribution) =>
  api.post<void>('/track', { body: { kind, attribution } });
