// Маршруты feedback (под /api/v1).
//   Клиент:  PUT /feedback/ratings            — оценка блюда из выданного заказа (создаёт или правит до 24 часов);
//            GET /feedback/orders             — выданные заказы с блюдами и оценками, признак «можно пожаловаться»;
//            GET /feedback/support            — контакты поддержки и статусы обращений;
//            POST /feedback/complaints        — жалоба (multipart: orderId, reason, dishId?, description?, photo?).
//   Фото:    GET /feedback/complaints/:id/photos/:photoId — владельцу жалобы и администратору (остальным 404).
//   Админ:   GET /admin/complaints?status=open|all · POST /admin/complaints/:id/resolve {outcome, comment?}.
import '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  complaintInputSchema,
  complaintListQuerySchema,
  rateInputSchema,
  resolveInputSchema,
} from '@sportpit/shared/schemas/feedback';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { noStore, parseWith } from '../system/http.ts';
import { feedbackFor } from './index.ts';

const ID = /^[A-Za-z0-9-]{1,64}$/;

const parse = <S extends z.ZodType>(schema: S, body: unknown) =>
  parseWith(schema, body, 'feedback');

interface ComplaintForm {
  fields: Record<string, string>;
  photo: Buffer | undefined;
}

/** Читает multipart жалобы: текстовые поля и не более одного файла `photo`. */
async function readComplaintForm(req: FastifyRequest): Promise<ComplaintForm> {
  if (!req.isMultipart()) throw errors.validation({ photo: 'feedback.error.notMultipart' });
  const fields: Record<string, string> = {};
  let photo: Buffer | undefined;
  try {
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = String(part.value ?? '');
        continue;
      }
      const data = await part.toBuffer();
      if (part.file.truncated)
        throw new AppError(413, 'photo_too_large', 'feedback.error.photoTooLarge');
      // пустое поле файла (форма отправлена без фото) — это «фото нет»
      if (part.fieldname === 'photo' && data.length > 0) photo = data;
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError(413, 'photo_too_large', 'feedback.error.photoTooLarge');
    }
    if (code === 'FST_FILES_LIMIT')
      throw errors.validation({ photo: 'feedback.error.photoTooMany' });
    throw error;
  }
  return { fields, photo };
}

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const feedback = feedbackFor(deps);
  const clientGuard = { preHandler: requireRole('client', 'admin') };
  const adminGuard = { preHandler: requireRole('admin') };
  const user = (req: FastifyRequest): number => currentUser(req)!.id;
  const idOf = (req: FastifyRequest, name = 'id'): string => {
    const raw = (req.params as Record<string, string>)[name]!;
    if (!ID.test(raw))
      throw new AppError(404, 'complaint_not_found', 'feedback.error.complaintNotFound');
    return raw;
  };

  // ---- оценки ----

  app.put('/feedback/ratings', clientGuard, async (req, reply) => {
    noStore(reply);
    const input = parse(rateInputSchema, req.body);
    return { rating: feedback.rateDish(user(req), input) };
  });

  app.get('/feedback/orders', clientGuard, async (req, reply) => {
    noStore(reply);
    return { items: feedback.ordersFor(user(req)) };
  });

  // ---- жалобы клиента ----

  app.get('/feedback/support', clientGuard, async (req, reply) => {
    noStore(reply);
    return feedback.support(user(req));
  });

  app.post('/feedback/complaints', clientGuard, async (req, reply) => {
    noStore(reply);
    const form = await readComplaintForm(req);
    const dishId = form.fields.dishId?.trim() ? Number(form.fields.dishId) : undefined;
    const input = parse(complaintInputSchema, {
      orderId: form.fields.orderId,
      ...(dishId !== undefined ? { dishId } : {}),
      reason: form.fields.reason,
      description: form.fields.description ?? '',
    });
    const complaint = await feedback.createComplaint(user(req), input, form.photo);
    return reply.code(201).send({ complaint });
  });

  // Фото жалобы: только владелец жалобы или администратор. Чужому — 404, как и несуществующему.
  app.get(
    '/feedback/complaints/:id/photos/:photoId',
    { preHandler: requireRole() },
    async (req, reply) => {
      const complaintId = idOf(req);
      const photoRaw = (req.params as { photoId: string }).photoId;
      if (!/^\d{1,9}$/.test(photoRaw)) throw errors.notFound();
      const viewer = currentUser(req)!;
      const file = await feedback.readPhoto(viewer, complaintId, Number(photoRaw));
      if (!file) throw errors.notFound();
      return reply
        .header('content-type', file.contentType)
        .header('cache-control', 'private, no-store')
        .header('content-disposition', 'inline')
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(file.data));
    },
  );

  // ---- администратор ----

  app.get('/admin/complaints', adminGuard, async (req, reply) => {
    noStore(reply);
    const { status } = parse(complaintListQuerySchema, req.query);
    return feedback.adminList(status);
  });

  app.post('/admin/complaints/:id/resolve', adminGuard, async (req, reply) => {
    noStore(reply);
    const input = parse(resolveInputSchema, req.body);
    return { complaint: feedback.resolveComplaint(user(req), idOf(req), input) };
  });
}
