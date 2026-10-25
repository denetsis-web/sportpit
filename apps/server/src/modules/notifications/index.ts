// Модуль notifications: внутренние уведомления (колокольчик). Web Push вне рамок.
// Другие модули только создают уведомления:
//   notify(deps, userId, 'rate_dish', { orderId, link: '/orders/12' })
//   или notificationsFor(deps).notify(userId, type, payload)
// Типы: credits_expiring, rate_dish, complaint_resolved, system_alert. Данные — плоский объект
// (строки, числа, булевы, null); `link` — путь внутри приложения для кнопки «Открыть».
import {
  notificationPayloadSchema,
  notificationTypeSchema,
  type NotificationDto,
  type NotificationList,
  type NotificationPayload,
  type NotificationType,
} from '@sportpit/shared/schemas/notifications';
import type { AppDeps } from '../../app.ts';

export type { NotificationDto, NotificationList, NotificationPayload, NotificationType };

export type NotificationsDeps = Pick<AppDeps, 'db' | 'clock'>;

const MAX_PAYLOAD_BYTES = 2000;

interface Row {
  id: number;
  type: NotificationType;
  payload: string;
  created_at: string;
  read_at: string | null;
}

export interface ListOptions {
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationsApi {
  /** Создаёт уведомление и возвращает его номер. Бросает ошибку при неверном типе, данных или пользователе. */
  notify(userId: number, type: NotificationType, payload?: NotificationPayload): number;
  /** Новые первыми, со счётчиком непрочитанных. */
  list(userId: number, options?: ListOptions): NotificationList;
  unreadCount(userId: number): number;
  /** Отмечает своё уведомление прочитанным; 0 — уже прочитано или не найдено (чужое не затрагивается). */
  markRead(userId: number, id: number): number;
  markAllRead(userId: number): number;
  /** Есть ли у пользователя такое уведомление (для ответа 404 на чужое). */
  exists(userId: number, id: number): boolean;
}

function toDto(row: Row): NotificationDto {
  let payload: NotificationPayload = {};
  try {
    payload = notificationPayloadSchema.parse(JSON.parse(row.payload));
  } catch {
    // повреждённые данные не должны ломать весь список
  }
  return { id: row.id, type: row.type, payload, createdAt: row.created_at, readAt: row.read_at };
}

const instances = new WeakMap<object, NotificationsApi>();

export function notificationsFor(deps: NotificationsDeps): NotificationsApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock } = deps;

  const unreadCount = (userId: number): number =>
    db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [userId],
    )!.n;

  const api: NotificationsApi = {
    notify(userId, type, payload = {}) {
      const checkedType = notificationTypeSchema.parse(type);
      const checkedPayload = notificationPayloadSchema.parse(payload);
      const json = JSON.stringify(checkedPayload);
      if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
        throw new RangeError('Данные уведомления слишком велики');
      }
      const { lastInsertRowid } = db.run(
        'INSERT INTO notifications (user_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
        [userId, checkedType, json, clock.now().toISOString()],
      );
      return Number(lastInsertRowid);
    },
    list(userId, { limit = 30, unreadOnly = false } = {}) {
      const rows = db.query<Row>(
        `SELECT id, type, payload, created_at, read_at FROM notifications
         WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
         ORDER BY id DESC LIMIT ?`,
        [userId, Math.min(Math.max(limit, 1), 100)],
      );
      return { items: rows.map(toDto), unreadCount: unreadCount(userId) };
    },
    unreadCount,
    markRead(userId, id) {
      return db.run(
        'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
        [clock.now().toISOString(), id, userId],
      ).changes;
    },
    markAllRead(userId) {
      return db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [
        clock.now().toISOString(),
        userId,
      ]).changes;
    },
    exists: (userId, id) =>
      db.get('SELECT 1 AS x FROM notifications WHERE id = ? AND user_id = ?', [id, userId]) !==
      undefined,
  };
  instances.set(deps, api);
  return api;
}

/** Короткая запись: `notify(deps, userId, type, payload)`. */
export function notify(
  deps: NotificationsDeps,
  userId: number,
  type: NotificationType,
  payload: NotificationPayload = {},
): number {
  return notificationsFor(deps).notify(userId, type, payload);
}
