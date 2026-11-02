// Маршруты catalog.
//   Публичные (их кэширует service worker, поэтому под /menu и /dishes только публичное):
//     GET /menu?date&goal&proteinMin&glutenFree&lactoseFree&vegetarian · GET /dishes/:id?date
//   Администратор (только /admin/...): блюда, фото, меню на дни.
import '@fastify/multipart';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  copyMenuSchema,
  dateSchema,
  dishInputSchema,
  dishPatchSchema,
  dishQuerySchema,
  menuQuerySchema,
  saveMenuSchema,
  type MenuFilters,
} from '@sportpit/shared/schemas/catalog';
import { addDaysISO } from '@sportpit/shared/time';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { noStore, parseWith } from '../system/http.ts';
import { catalogFor } from './index.ts';

const parseBody = <S extends z.ZodType>(schema: S, body: unknown) =>
  parseWith(schema, body, ['admin', 'catalog']);

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const catalog = catalogFor(deps);
  const guard = { preHandler: requireRole('admin') };
  const actor = (req: FastifyRequest): number => currentUser(req)!.id;
  const revalidate = (reply: FastifyReply) => reply.header('cache-control', 'no-cache');

  const dishIdOf = (req: FastifyRequest): number => {
    const raw = (req.params as { id: string }).id;
    if (!/^\d{1,9}$/.test(raw)) throw errors.notFound('catalog.error.dishNotFound');
    return Number(raw);
  };
  const dateOf = (req: FastifyRequest): string => {
    const raw = (req.params as { date: string }).date;
    const parsed = dateSchema.safeParse(raw);
    if (!parsed.success) throw errors.validation({ date: 'catalog.error.date' });
    return parsed.data;
  };

  // ---- клиент ----

  app.get('/menu', async (req, reply) => {
    revalidate(reply);
    const q = parseBody(menuQuerySchema, req.query);
    const filters: MenuFilters = {};
    if (q.goal) filters.goal = q.goal;
    if (q.proteinMin !== undefined) filters.proteinMin = q.proteinMin;
    if (q.glutenFree) filters.glutenFree = true;
    if (q.lactoseFree) filters.lactoseFree = true;
    if (q.vegetarian) filters.vegetarian = true;
    return catalog.listMenu(q.date, filters);
  });

  app.get('/dishes/:id', async (req, reply) => {
    revalidate(reply);
    const id = dishIdOf(req);
    const q = parseBody(dishQuerySchema, req.query);
    const card = catalog.getDish(id, q.date);
    if (!card) throw errors.notFound('catalog.error.dishNotFound');
    return card;
  });

  // ---- блюда (администратор) ----

  app.get('/admin/dishes', guard, async (_req, reply) => {
    noStore(reply);
    return { items: catalog.listDishes() };
  });

  app.post('/admin/dishes', guard, async (req, reply) => {
    const input = parseBody(dishInputSchema, req.body);
    return reply.code(201).send(catalog.upsertDish(input, actor(req)));
  });

  app.patch('/admin/dishes/:id', guard, async (req) => {
    const id = dishIdOf(req);
    const patch = parseBody(dishPatchSchema, req.body);
    return catalog.upsertDish(patch, actor(req), id);
  });

  app.post('/admin/dishes/:id/photo', guard, async (req) => {
    const id = dishIdOf(req);
    const part = await req.file();
    if (!part || part.fieldname !== 'photo') {
      throw errors.validation({ photo: 'catalog.error.photoMissing' });
    }
    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch (error) {
      if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppError(413, 'photo_too_large', 'catalog.error.photoTooLarge');
      }
      throw error;
    }
    if (part.file.truncated)
      throw new AppError(413, 'photo_too_large', 'catalog.error.photoTooLarge');
    return catalog.setDishPhoto(id, data, actor(req));
  });

  app.delete('/admin/dishes/:id/photo', guard, async (req) => {
    return catalog.removeDishPhoto(dishIdOf(req), actor(req));
  });

  // ---- меню на дни (администратор) ----

  app.get('/admin/menu', guard, async (req, reply) => {
    noStore(reply);
    const q = req.query as { from?: string; to?: string };
    const from = q.from ?? deps.clock.localDate();
    const to = q.to ?? addDaysISO(from, 13);
    if (!dateSchema.safeParse(from).success || !dateSchema.safeParse(to).success) {
      throw errors.validation({ from: 'catalog.error.date' });
    }
    return { items: catalog.listMenuDays(from, to) };
  });

  app.get('/admin/menu/:date', guard, async (req, reply) => {
    noStore(reply);
    return catalog.adminMenuDay(dateOf(req));
  });

  app.put('/admin/menu/:date', guard, async (req) => {
    const date = dateOf(req);
    const body = parseBody(saveMenuSchema, req.body);
    return catalog.saveMenu(date, body.items, actor(req));
  });

  app.post('/admin/menu/:date/publish', guard, async (req) => {
    return catalog.publishMenu(dateOf(req), actor(req));
  });

  app.post('/admin/menu/:date/copy', guard, async (req) => {
    const date = dateOf(req);
    const body = parseBody(copyMenuSchema, req.body);
    return catalog.copyMenu(date, body.fromDate, actor(req));
  });
}
