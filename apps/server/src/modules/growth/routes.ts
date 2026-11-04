// Маршруты growth (под /api/v1).
// Публичные, без входа и без cookie:
//   POST /waitlist  — запись в лист ожидания: 200 { ok: true } и для новой записи, и для повтора номера (номер не выдаётся);
//   POST /track     — событие лендинга (landing_view, calc_used): 204.
// Только администратор:
//   GET    /admin/waitlist?q&gym&goal&lang&source&from&to&page  — список по 50 с отметками пути;
//   GET    /admin/waitlist/csv?…&labels                         — тот же список файлом для Excel;
//   DELETE /admin/waitlist/:id                                   — удаление записи и событий с её анонимным номером (по просьбе человека), пишется в журнал действий;
//   GET    /admin/funnel?from&to                                 — воронка по источникам за период.
// Заодно модуль подключает к удалению аккаунта хук «growth»: запись листа, источник регистрации и события воронки человека стираются.
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  funnelQuerySchema,
  trackEventSchema,
  waitlistCsvQuerySchema,
  waitlistJoinSchema,
  waitlistListQuerySchema,
} from '@sportpit/shared/schemas/growth';
import type { AppDeps, AppInstance } from '../../app.ts';
import { audit } from '../admin/index.ts';
import { authFor, currentUser, requireRole } from '../auth/index.ts';
import { profileFor } from '../profile/index.ts';
import { reportsFor } from '../reports/index.ts';
import {
  AppError,
  createRateLimiter,
  errors,
  noStore,
  parseWith,
  pickLang,
  type RateLimiter,
} from '../system/index.ts';
import { waitlistCsv } from './csv.ts';
import { recordEvent, resolveAttribution } from './events.ts';
import { funnelReport } from './funnel.ts';
import {
  allWaitlist,
  deleteWaitlistEntry,
  eraseUserTraces,
  joinWaitlist,
  listWaitlist,
} from './waitlist.ts';

/** Лимиты публичных маршрутов, в памяти процесса. Адрес клиента — `req.ip` (за прокси нужен TRUST_PROXY). */
const JOIN_PER_IP = { max: 30, windowMs: 3_600_000 };
const JOIN_PER_PHONE = { max: 3, windowMs: 86_400_000 };
const TRACK_PER_IP = { max: 120, windowMs: 60_000 };

const parse = <S extends z.ZodType>(schema: S, body: unknown) => parseWith(schema, body, 'growth');

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const { db, clock } = deps;
  const adminGuard = { preHandler: requireRole('admin') };

  // Лимитеры записи в лист и событий отдельные: ни один не трогает вход и друг друга.
  const joinByIp = createRateLimiter({ clock, ...JOIN_PER_IP });
  const joinByPhone = createRateLimiter({ clock, ...JOIN_PER_PHONE });
  const trackByIp = createRateLimiter({ clock, ...TRACK_PER_IP });

  /** Для записи в лист вместо «подождите N сек» (бывает и сутки) — понятный текст без секунд. */
  const joinLimit = (limiter: RateLimiter, key: string): void => {
    try {
      limiter.hit(key);
    } catch (error) {
      if (error instanceof AppError && error.code === 'rate_limited') {
        throw new AppError(429, 'rate_limited', 'growth.error.waitlistLimit');
      }
      throw error;
    }
  };

  // Удаление аккаунта стирает запись листа по телефону, источник регистрации и события воронки с анонимными
  // номерами человека. Хук идёт до обезличивания, поэтому телефон ещё читается.
  profileFor(deps).registerDeletionHook('growth', (userId, tx) =>
    eraseUserTraces(tx, userId, authFor(deps).getUser(userId)?.phone),
  );

  // ---- публичные ----

  app.post('/waitlist', async (req, reply) => {
    noStore(reply);
    joinLimit(joinByIp, req.ip);
    // Приманка: бот заполняет невидимое поле. Ответ тот же, что у настоящей записи, — но записи нет.
    const bait = (req.body as { website?: unknown } | null | undefined)?.website;
    if (typeof bait === 'string' && bait.trim() !== '') return { ok: true as const };
    const input = parseWith(waitlistJoinSchema, req.body, 'growth', {
      fieldMessages: { phone: 'auth.error.phone', consent: 'growth.error.consent' },
    });
    joinLimit(joinByPhone, input.phone);
    joinWaitlist(db, clock, input);
    return { ok: true as const };
  });

  app.post('/track', async (req, reply) => {
    noStore(reply);
    trackByIp.hit(req.ip);
    const { kind, attribution } = parse(trackEventSchema, req.body);
    recordEvent(db, clock, kind, resolveAttribution(attribution));
    return reply.code(204).send();
  });

  // ---- администратор ----

  app.get('/admin/waitlist', adminGuard, async (req, reply) => {
    noStore(reply);
    return listWaitlist(db, parse(waitlistListQuerySchema, req.query));
  });

  app.get('/admin/waitlist/csv', adminGuard, async (req, reply) => {
    noStore(reply);
    const { labels, ...filters } = parse(waitlistCsvQuerySchema, req.query);
    const lang = labels ?? pickLang(req.headers['accept-language']);
    const file = waitlistCsv(allWaitlist(db, filters), lang, clock.localDate());
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  });

  app.delete('/admin/waitlist/:id', adminGuard, async (req, reply) => {
    noStore(reply);
    const id = idOf(req);
    if (!deleteWaitlistEntry(db, id)) throw errors.notFound('growth.error.notFound');
    // В журнал идёт только номер записи: телефона и имени там быть не должно.
    audit(deps, currentUser(req)!.id, 'waitlist.delete', `waitlist:${id}`);
    return reply.code(204).send();
  });

  app.get('/admin/funnel', adminGuard, async (req, reply) => {
    noStore(reply);
    const { from, to } = parse(funnelQuerySchema, req.query);
    return funnelReport(db, reportsFor(deps).range(from, to));
  });
}

function idOf(req: FastifyRequest): number {
  const id = Number((req.params as { id?: string }).id);
  if (!Number.isInteger(id) || id < 1) throw errors.notFound('growth.error.notFound');
  return id;
}
