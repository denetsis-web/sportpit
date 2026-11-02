// Маршруты admin: /api/v1/admin/* — только администратор; /fridges и /settings/public — любой посетитель.
// Коды замка и служебные настройки наружу не отдаются.
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  fridgeInputSchema,
  fridgePatchSchema,
  gymInputSchema,
  gymPatchSchema,
  settingsPatchSchema,
  type SettingKey,
} from '@sportpit/shared/schemas/admin';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { errors } from '../system/errors.ts';
import { noStore, parseWith } from '../system/http.ts';
import { adminFor } from './index.ts';

const parseBody = <S extends z.ZodType>(schema: S, body: unknown) =>
  parseWith(schema, body, ['admin', 'catalog']);

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const admin = adminFor(deps);
  const guard = { preHandler: requireRole('admin') };
  const actor = (req: FastifyRequest): number => currentUser(req)!.id;
  const idOf = (req: FastifyRequest): string => (req.params as { id: string }).id;

  // ---- залы ----

  app.get('/admin/gyms', guard, async (_req, reply) => {
    noStore(reply);
    return { items: admin.listGyms() };
  });

  app.post('/admin/gyms', guard, async (req, reply) => {
    const input = parseBody(gymInputSchema, req.body);
    return reply.code(201).send(admin.createGym(input, actor(req)));
  });

  app.patch('/admin/gyms/:id', guard, async (req) => {
    const patch = parseBody(gymPatchSchema, req.body);
    return admin.updateGym(idOf(req), patch, actor(req));
  });

  // ---- холодильники ----

  app.get('/admin/fridges', guard, async (req, reply) => {
    noStore(reply);
    const { gymId } = req.query as { gymId?: string };
    return { items: admin.listFridges(gymId ? { gymId } : {}) };
  });

  app.get('/admin/fridges/:id', guard, async (req, reply) => {
    noStore(reply);
    const fridge = admin.getFridge(idOf(req));
    if (!fridge) throw errors.notFound('admin.error.fridgeNotFound');
    return fridge;
  });

  app.post('/admin/fridges', guard, async (req, reply) => {
    const input = parseBody(fridgeInputSchema, req.body);
    return reply.code(201).send(admin.createFridge(input, actor(req)));
  });

  app.patch('/admin/fridges/:id', guard, async (req) => {
    const patch = parseBody(fridgePatchSchema, req.body);
    return admin.updateFridge(idOf(req), patch, actor(req));
  });

  // ---- настройки ----

  app.get('/admin/settings', guard, async (_req, reply) => {
    noStore(reply);
    return admin.allSettings();
  });

  app.put('/admin/settings', guard, async (req) => {
    const patch = parseBody(settingsPatchSchema, req.body);
    const keys = Object.keys(patch) as SettingKey[];
    // все ключи проверены схемой выше: сохраняются целиком или ни один
    deps.db.tx(() => {
      for (const key of keys) {
        admin.setSetting(key, patch[key] as never, actor(req));
      }
    });
    return admin.allSettings();
  });

  // ---- журнал действий ----

  app.get('/admin/audit', guard, async (req, reply) => {
    noStore(reply);
    const query = req.query as { limit?: string; offset?: string };
    return admin.listAudit({
      limit: Number(query.limit) || 50,
      offset: Number(query.offset) || 0,
    });
  });

  // ---- для клиентов ----

  app.get('/fridges', async (_req, reply) => {
    noStore(reply);
    return { items: admin.listPublicFridges() };
  });

  app.get('/fridges/:id', async (req, reply) => {
    noStore(reply);
    const fridge = admin.getPublicFridge(idOf(req));
    if (!fridge) throw errors.notFound('admin.error.fridgeNotFound');
    return fridge;
  });

  app.get('/settings/public', async (_req, reply) => {
    noStore(reply);
    const { maxBoxesPerDay, toleranceNote, supportContacts } = admin.allSettings();
    return { maxBoxesPerDay, toleranceNote, supportContacts };
  });
}
