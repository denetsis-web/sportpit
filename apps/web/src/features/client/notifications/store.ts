// Состояние уведомлений: один общий «магазин» для колокольчика и страницы списка.
import { useSyncExternalStore } from 'react';
import {
  markedReadSchema,
  notificationListSchema,
  type NotificationDto,
} from '@sportpit/shared/schemas/notifications';
import { api } from '../../../api/index.ts';

export interface NotificationsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: NotificationDto[];
  unreadCount: number;
}

const EMPTY: NotificationsState = { status: 'idle', items: [], unreadCount: 0 };
let state: NotificationsState = EMPTY;
/** Растёт при сбросе: ответы на запросы, начатые до сброса (другой пользователь), отбрасываются. */
let generation = 0;
const listeners = new Set<() => void>();

function setState(next: NotificationsState): void {
  if (next === state) return;
  state = next;
  listeners.forEach((listener) => listener());
}

export const getNotifications = (): NotificationsState => state;

export async function refreshNotifications(): Promise<void> {
  const started = generation;
  // уже загруженный список не прячем на время обновления
  if (state.status !== 'ready') setState({ ...state, status: 'loading' });
  try {
    const list = await api.get('/notifications', {
      query: { limit: 30 },
      schema: notificationListSchema,
    });
    if (started !== generation) return;
    setState({ status: 'ready', items: list.items, unreadCount: list.unreadCount });
  } catch {
    if (started !== generation) return;
    setState({ ...state, status: state.items.length > 0 ? 'ready' : 'error' });
  }
}

async function applyMarked(path: string, markAll: boolean, id?: number): Promise<void> {
  const started = generation;
  try {
    const result = await api.post(path, { schema: markedReadSchema });
    if (started !== generation) return;
    const readAt = new Date().toISOString();
    setState({
      ...state,
      unreadCount: result.unreadCount,
      items: state.items.map((item) =>
        (markAll || item.id === id) && item.readAt === null ? { ...item, readAt } : item,
      ),
    });
  } catch {
    // не получилось отметить — покажем актуальное состояние с сервера
    await refreshNotifications();
  }
}

export const markRead = (id: number): Promise<void> =>
  applyMarked(`/notifications/${id}/read`, false, id);

export const markAllRead = (): Promise<void> => applyMarked('/notifications/read-all', true);

/** Сброс (выход из аккаунта, тесты). */
export function resetNotifications(): void {
  generation += 1;
  setState(EMPTY);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotifications(): NotificationsState {
  return useSyncExternalStore(subscribe, getNotifications, getNotifications);
}
