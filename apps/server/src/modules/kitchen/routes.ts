// Маршруты kitchen (под /api/v1), только роли «кухня» и «администратор»:
//   GET  /kitchen/summary?date            — сводка на дату (по умолчанию завтра);
//   POST /kitchen/batches/:id/confirm      — подтвердить производство партии;
//   POST /kitchen/batches/:id/cooked       — отметить партию приготовленной;
//   GET  /kitchen/batches/:id/label        — данные этикетки приготовленной партии.
import type { FastifyRequest } from 'fastify';
import { summaryQuerySchema } from '@sportpit/shared/schemas/kitchen';
import { addDaysISO } from '@sportpit/shared/time';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { AppError, errors, noStore } from '../system/index.ts';
import { kitchenFor } from './index.ts';

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const kitchen = kitchenFor(deps);
  const guard = { preHandler: requireRole('kitchen', 'admin') };
  const actor = (req: FastifyRequest): number | null => currentUser(req)?.id ?? null;
  const batchIdOf = (req: FastifyRequest): number => {
    const raw = (req.params as { id: string }).id;
    if (!/^\d{1,9}$/.test(raw))
      throw new AppError(404, 'batch_not_found', 'kitchen.error.batchNotFound');
    return Number(raw);
  };

  app.get('/kitchen/summary', guard, async (req, reply) => {
    noStore(reply);
    const parsed = summaryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) throw errors.validation({ date: 'kitchen.error.date' });
    return kitchen.productionSummary(parsed.data.date ?? addDaysISO(deps.clock.localDate(), 1));
  });

  app.post('/kitchen/batches/:id/confirm', guard, async (req, reply) => {
    noStore(reply);
    return { batch: kitchen.confirmProduction(batchIdOf(req), actor(req)) };
  });

  app.post('/kitchen/batches/:id/cooked', guard, async (req, reply) => {
    noStore(reply);
    return { batch: kitchen.markCooked(batchIdOf(req), actor(req)) };
  });

  app.get('/kitchen/batches/:id/label', guard, async (req, reply) => {
    noStore(reply);
    return kitchen.labelData(batchIdOf(req));
  });
}
