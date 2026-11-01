// Маршруты fulfillment (под /api/v1).
// Оператор и администратор (оператор — только свои холодильники):
//   GET  /operator/fridges                         — мои холодильники;
//   GET  /operator/fridges/:id/day?date            — график дня: что положить, заказы, итоги, закрытие, температура;
//   POST /operator/fridges/:id/loaded {date}       — «загружено»;
//   POST /operator/fridges/:id/pickup {date, code} — выдача по коду клиента;
//   POST /operator/fridges/:id/close-day {...}     — остаток и закрытие дня;
//   GET|POST /operator/fridges/:id/temperature     — журнал температуры и ввод замера.
// Администратор: GET /admin/temperature/missed?from&to — пропущенные замеры.
// Клиент: GET /pickup/orders · GET /pickup/orders/:id · POST /pickup/orders/:id/pickup («Забрал»).
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  closeDaySchema,
  dayQuerySchema,
  fridgeParamsSchema,
  loadBodySchema,
  pickupByCodeSchema,
  rangeQuerySchema,
  temperatureBodySchema,
} from '@sportpit/shared/schemas/fulfillment';
import { addDaysISO } from '@sportpit/shared/time';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireFridgeAccess, requireRole } from '../auth/index.ts';
import type { OrderActor } from '../orders/index.ts';
import { AppError, errors, pickLang } from '../system/index.ts';
import { fulfillmentFor } from './index.ts';

const OWN_KEY = /^fulfillment\.error\./;
const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const name = issue.path.map(String).join('.') || '_';
    fields[name] ??= OWN_KEY.test(issue.message) ? issue.message : 'core.error.validation';
  }
  throw errors.validation(fields);
}

const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const fulfillment = fulfillmentFor(deps);
  const staff = (req: FastifyRequest) => ({
    userId: currentUser(req)!.id,
    role: currentUser(req)!.role,
  });
  const actorOf = (req: FastifyRequest): OrderActor => ({
    kind: staff(req).role === 'admin' ? 'admin' : 'operator',
    userId: staff(req).userId,
  });
  const langOf = (req: FastifyRequest) => pickLang(req.headers['accept-language']);
  const fridgeIdOf = (req: FastifyRequest): string => parse(fridgeParamsSchema, req.params).id;
  // роль проверяется первой, затем доступ к холодильнику из адреса
  const operatorGuard = [requireRole('operator', 'admin'), requireFridgeAccess(fridgeIdOf)];
  const operatorOnly = { preHandler: requireRole('operator', 'admin') };
  const guard = { preHandler: operatorGuard };

  // ---- оператор ----

  app.get('/operator/fridges', operatorOnly, async (req, reply) => {
    noStore(reply);
    return { items: fulfillment.fridgesFor(currentUser(req)!) };
  });

  app.get('/operator/fridges/:id/day', guard, async (req, reply) => {
    noStore(reply);
    const { date } = parse(dayQuerySchema, req.query);
    return fulfillment.dayOverview(fridgeIdOf(req), date ?? deps.clock.localDate(), langOf(req));
  });

  app.post('/operator/fridges/:id/loaded', guard, async (req, reply) => {
    noStore(reply);
    const { date } = parse(loadBodySchema, req.body);
    return fulfillment.markLoaded(fridgeIdOf(req), date, staff(req).userId, langOf(req));
  });

  app.post('/operator/fridges/:id/pickup', guard, async (req, reply) => {
    noStore(reply);
    const { date, code } = parse(pickupByCodeSchema, req.body);
    return fulfillment.pickupByCode(fridgeIdOf(req), date, code, actorOf(req));
  });

  app.post('/operator/fridges/:id/close-day', guard, async (req, reply) => {
    noStore(reply);
    return fulfillment.closeDay(fridgeIdOf(req), parse(closeDaySchema, req.body), actorOf(req));
  });

  app.get('/operator/fridges/:id/temperature', guard, async (req, reply) => {
    noStore(reply);
    const { from, to } = parse(rangeQuerySchema, req.query);
    const end = to ?? deps.clock.localDate();
    return { items: fulfillment.temperatureLog(fridgeIdOf(req), from ?? addDaysISO(end, -6), end) };
  });

  app.post('/operator/fridges/:id/temperature', guard, async (req, reply) => {
    noStore(reply);
    const { slot, celsius } = parse(temperatureBodySchema, req.body);
    const entry = fulfillment.logTemperature(fridgeIdOf(req), slot, celsius, staff(req).userId);
    return reply.code(201).send({ entry });
  });

  // ---- администратор ----

  app.get('/admin/temperature/missed', { preHandler: requireRole('admin') }, async (req, reply) => {
    noStore(reply);
    const { from, to } = parse(rangeQuerySchema, req.query);
    return fulfillment.missedTemperature(from, to);
  });

  // ---- клиент ----

  const clientGuard = { preHandler: requireRole('client') };
  const user = (req: FastifyRequest): number => currentUser(req)!.id;
  const orderIdOf = (req: FastifyRequest): string => {
    const raw = (req.params as { id: string }).id;
    if (!ORDER_ID.test(raw)) {
      throw new AppError(404, 'order_not_found', 'fulfillment.error.orderNotFound');
    }
    return raw;
  };

  app.get('/pickup/orders', clientGuard, async (req, reply) => {
    noStore(reply);
    return { items: fulfillment.clientOrders(user(req)) };
  });

  app.get('/pickup/orders/:id', clientGuard, async (req, reply) => {
    noStore(reply);
    return { order: fulfillment.clientOrder(user(req), orderIdOf(req)) };
  });

  app.post('/pickup/orders/:id/pickup', clientGuard, async (req, reply) => {
    noStore(reply);
    return fulfillment.pickupByClient(user(req), orderIdOf(req));
  });
}
