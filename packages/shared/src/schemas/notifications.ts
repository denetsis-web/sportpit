// Схемы внутренних уведомлений (колокольчик). Общие для сервера и клиента.
import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'credits_expiring',
  'rate_dish',
  'complaint_resolved',
  'system_alert',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

/**
 * Данные уведомления: плоский объект из строк, чисел, булевых значений и null.
 * По типам договорились о полях (все необязательные для показа):
 *   credits_expiring    { count, expiresOn?, link? }
 *   rate_dish           { orderId?, dishId?, link? }
 *   complaint_resolved  { complaintId?, outcome?, link? }
 *   system_alert        { kind, count }
 * `link` — путь внутри приложения (начинается с «/»), по нему ведёт кнопка «Открыть».
 */
export const notificationPayloadSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export const notificationSchema = z.object({
  id: z.number().int(),
  type: notificationTypeSchema,
  payload: notificationPayloadSchema,
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

export const markedReadSchema = z.object({
  marked: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
