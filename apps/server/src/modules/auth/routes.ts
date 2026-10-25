// Маршруты входа: /api/v1/auth/*. Код входа в ответах не возвращается ни в каком режиме.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  consentChangesSchema,
  otpRequestSchema,
  otpVerifySchema,
  profileLangSchema,
  setFridgesSchema,
  setRoleSchema,
} from '@sportpit/shared/schemas/auth';
import type { AppDeps, AppInstance } from '../../app.ts';
import { AppError, errors, pickLang } from '../system/index.ts';
import { authFor, currentUser, requireRole, SESSION_COOKIE, SESSION_TTL_SECONDS } from './index.ts';

/** Ошибки полей входа — с понятным текстом, а не общим «проверьте данные». */
const FIELD_MESSAGES: Record<string, string> = {
  phone: 'auth.error.phone',
  code: 'auth.error.codeFormat',
};

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? '_');
    fields[name] = FIELD_MESSAGES[name] ?? 'core.error.validation';
  }
  const first = Object.values(fields)[0] ?? 'core.error.validation';
  throw new AppError(400, 'validation_failed', first, { fields });
}

const langOf = (req: FastifyRequest) =>
  pickLang(req.headers['accept-language'], (req.query as { lang?: unknown } | undefined)?.lang);

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const auth = authFor(deps);
  // Secure — только на https-хостинге: локально сервис работает по http.
  const secure = deps.config.publicBaseUrl.startsWith('https://');
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
  };
  const tokenOf = (req: FastifyRequest) =>
    (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  const noStore = (reply: FastifyReply) => reply.header('cache-control', 'no-store');

  app.post('/auth/otp/request', async (req, reply) => {
    noStore(reply);
    const { phone } = parse(otpRequestSchema, req.body);
    const sent = await auth.requestOtp(phone, langOf(req));
    return { ok: true as const, ...sent };
  });

  app.post('/auth/otp/verify', async (req, reply) => {
    noStore(reply);
    const { phone, code, lang } = parse(otpVerifySchema, req.body);
    const { user, token } = auth.verifyOtp(phone, code, lang);
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
    return { user };
  });

  app.post('/auth/logout', async (req, reply) => {
    noStore(reply);
    auth.logout(tokenOf(req));
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return { ok: true };
  });

  app.get('/auth/me', async (req, reply) => {
    noStore(reply);
    return { user: currentUser(req) };
  });

  app.patch('/auth/me', { preHandler: requireRole() }, async (req, reply) => {
    noStore(reply);
    const { lang } = parse(profileLangSchema, req.body);
    return { user: auth.setLang(currentUser(req)!.id, lang) };
  });

  // ---- согласия ----

  app.get('/auth/consents', { preHandler: requireRole() }, async (req, reply) => {
    noStore(reply);
    return { items: auth.consents(currentUser(req)!.id) };
  });

  app.post('/auth/consents', { preHandler: requireRole() }, async (req, reply) => {
    noStore(reply);
    const { changes } = parse(consentChangesSchema, req.body);
    return { items: auth.recordConsents(currentUser(req)!.id, changes) };
  });

  // ---- роли и холодильники оператора (администратор) ----

  const adminOnly = { preHandler: requireRole('admin') };
  const idOf = (req: FastifyRequest): number => {
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id < 1) throw errors.notFound('auth.error.userNotFound');
    return id;
  };

  app.get('/auth/users', adminOnly, async (req, reply) => {
    noStore(reply);
    const query = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
    const offset = Math.max(Number(query.offset) || 0, 0);
    return { items: auth.listUsers(limit, offset) };
  });

  app.put('/auth/users/:id/role', adminOnly, async (req) => {
    const id = idOf(req);
    const { role } = parse(setRoleSchema, req.body);
    if (id === currentUser(req)!.id) {
      throw new AppError(400, 'own_role', 'auth.error.ownRole');
    }
    return { user: auth.setRole(id, role) };
  });

  app.put('/auth/users/:id/fridges', adminOnly, async (req) => {
    const { fridgeIds } = parse(setFridgesSchema, req.body);
    return { user: auth.setOperatorFridges(idOf(req), fridgeIds) };
  });
}
