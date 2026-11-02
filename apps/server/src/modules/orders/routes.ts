// Маршруты orders (под /api/v1), все для вошедшего клиента:
//   GET  /orders/availability?fridgeId&date  — срок, свободные места, лимит клиента на день;
//   POST /orders                              — подтвердить заказ (идемпотентно по ключу);
//   GET  /orders · GET /orders/:id            — «Мои заказы» и один заказ;
//   POST /orders/:id/cancel · /orders/:id/move — отмена и перенос до срока;
//   GET|POST /pauses                          — пауза пакета (R27.1).
// Заодно модуль подключает к профилю выгрузку данных «orders» и хук удаления аккаунта «orders».
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  availabilityQuerySchema,
  confirmOrderSchema,
  moveOrderSchema,
  pauseCreateSchema,
} from '@sportpit/shared/schemas/orders';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { profileFor } from '../profile/index.ts';
import { AppError, pickLang } from '../system/index.ts';
import { noStore, parseWith } from '../system/http.ts';
import { ordersFor } from './index.ts';

const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;

const parse = <S extends z.ZodType>(schema: S, body: unknown) => parseWith(schema, body, 'orders');

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const orders = ordersFor(deps);
  const guard = { preHandler: requireRole('client', 'admin') };
  const user = (req: FastifyRequest): number => currentUser(req)!.id;
  const langOf = (req: FastifyRequest) => pickLang(req.headers['accept-language']);
  const orderIdOf = (req: FastifyRequest): string => {
    const raw = (req.params as { id: string }).id;
    if (!ORDER_ID.test(raw))
      throw new AppError(404, 'order_not_found', 'orders.error.orderNotFound');
    return raw;
  };

  // ---- выгрузка данных и удаление аккаунта (R29, R29.1) ----

  const profile = profileFor(deps);
  profile.registerExportProvider('orders', (userId) => ({
    items: orders.listForExport(userId).map((o) => ({
      id: o.id,
      date: o.date,
      fridge: o.fridge,
      status: o.status,
      boxes: o.boxes,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({ dishId: i.dishId, qty: i.qty, name: i.name })),
    })),
  }));
  // Будущие подтверждённые заказы отменяются (резерв кредитов освобождается) в той же транзакции,
  // что и удаление аккаунта. Прошлые и уже загруженные остаются: пользователь обезличен (users.phone = NULL).
  profile.registerDeletionHook('orders', (userId, tx) => {
    const today = deps.clock.localDate();
    const future = tx.query<{ id: string }>(
      `SELECT id FROM orders WHERE user_id = ? AND status = 'confirmed' AND date > ? ORDER BY id`,
      [userId, today],
    );
    for (const { id } of future) orders.transition(id, 'cancelled', { kind: 'system', userId });
  });

  // ---- клиент ----

  app.get('/orders/availability', guard, async (req, reply) => {
    noStore(reply);
    const { fridgeId, date } = parse(availabilityQuerySchema, req.query);
    return orders.availability(user(req), fridgeId, date);
  });

  app.post('/orders', guard, async (req, reply) => {
    noStore(reply);
    const input = parse(confirmOrderSchema, req.body);
    const { order, created, firstOrder } = orders.confirmOrder(user(req), input, langOf(req));
    return reply.code(created ? 201 : 200).send({ order, firstOrder });
  });

  app.get('/orders', guard, async (req, reply) => {
    noStore(reply);
    return orders.listOrders(user(req));
  });

  app.get('/orders/:id', guard, async (req, reply) => {
    noStore(reply);
    return { order: orders.getForUser(user(req), orderIdOf(req)) };
  });

  app.post('/orders/:id/cancel', guard, async (req, reply) => {
    noStore(reply);
    return { order: orders.cancelOrder(user(req), orderIdOf(req)) };
  });

  app.post('/orders/:id/move', guard, async (req, reply) => {
    noStore(reply);
    const input = parse(moveOrderSchema, req.body);
    const moved = orders.moveOrder(user(req), orderIdOf(req), input, langOf(req));
    return reply
      .code(moved.created ? 201 : 200)
      .send({ order: moved.order, cancelledId: moved.cancelledId });
  });

  // ---- пауза пакета ----

  app.get('/pauses', guard, async (req, reply) => {
    noStore(reply);
    return { items: orders.listPauses(user(req)) };
  });

  app.post('/pauses', guard, async (req, reply) => {
    noStore(reply);
    const input = parse(pauseCreateSchema, req.body);
    return reply.code(201).send({ pause: orders.pauseLot(user(req), input) });
  });
}
