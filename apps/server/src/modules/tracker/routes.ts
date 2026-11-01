// Маршруты tracker (под /api/v1), все для вошедшего клиента и только про него самого:
//   GET    /tracker/day?date          — итоги дня: выданные боксы, ручные записи, цель из анкеты;
//   GET    /tracker/week?date         — неделя (понедельник–воскресенье), в которую попадает дата;
//   POST   /tracker/entries           — новая ручная запись;
//   PATCH  /tracker/entries/:id       — правка записи;
//   DELETE /tracker/entries/:id       — удаление записи.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  dayQuerySchema,
  entryInputSchema,
  entryPatchSchema,
} from '@sportpit/shared/schemas/tracker';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { trackerFor } from './index.ts';

const OWN_KEY = /^tracker\.error\./;

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {});
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
  const tracker = trackerFor(deps);
  const guard = { preHandler: requireRole('client', 'admin') };
  const user = (req: FastifyRequest): number => currentUser(req)!.id;
  const entryIdOf = (req: FastifyRequest): number => {
    const raw = (req.params as { id: string }).id;
    if (!/^\d{1,9}$/.test(raw)) {
      throw new AppError(404, 'entry_not_found', 'tracker.error.entryNotFound');
    }
    return Number(raw);
  };

  app.get('/tracker/day', guard, async (req, reply) => {
    noStore(reply);
    const { date } = parse(dayQuerySchema, req.query);
    return tracker.dayTotals(user(req), date);
  });

  app.get('/tracker/week', guard, async (req, reply) => {
    noStore(reply);
    const { date } = parse(dayQuerySchema, req.query);
    return tracker.weekTotals(user(req), date);
  });

  app.post('/tracker/entries', guard, async (req, reply) => {
    noStore(reply);
    const entry = tracker.addEntry(user(req), parse(entryInputSchema, req.body));
    return reply.code(201).send({ entry });
  });

  app.patch('/tracker/entries/:id', guard, async (req, reply) => {
    noStore(reply);
    const id = entryIdOf(req);
    return { entry: tracker.updateEntry(user(req), id, parse(entryPatchSchema, req.body)) };
  });

  app.delete('/tracker/entries/:id', guard, async (req, reply) => {
    noStore(reply);
    tracker.deleteEntry(user(req), entryIdOf(req));
    return { deleted: true };
  });
}
