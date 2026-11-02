// Маршруты колокольчика: /api/v1/notifications. Видны и отмечаются только свои уведомления.
import type { FastifyRequest } from 'fastify';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { errors } from '../system/index.ts';
import { watchSystemEvents } from './alerts.ts';
import { notificationsFor, registerPrivacy } from './index.ts';

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const api = notificationsFor(deps);
  const guard = { preHandler: requireRole() };
  const me = (req: FastifyRequest): number => currentUser(req)!.id;

  // выгрузка и удаление данных клиента
  registerPrivacy(deps);

  // Сбои оплаты и SMS → уведомление администраторам.
  watchSystemEvents(deps);

  app.get('/notifications', guard, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const query = req.query as { limit?: string; unread?: string };
    return api.list(me(req), {
      limit: Number(query.limit) || 30,
      unreadOnly: query.unread === '1' || query.unread === 'true',
    });
  });

  app.post('/notifications/read-all', guard, async (req) => {
    const marked = api.markAllRead(me(req));
    return { marked, unreadCount: api.unreadCount(me(req)) };
  });

  app.post('/notifications/:id/read', guard, async (req) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || !api.exists(me(req), id)) throw errors.notFound();
    const marked = api.markRead(me(req), id);
    return { marked, unreadCount: api.unreadCount(me(req)) };
  });
}
