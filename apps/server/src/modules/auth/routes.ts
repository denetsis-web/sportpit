// Маршруты входа: /api/v1/auth/*. Код входа в ответах не возвращается ни в каком режиме.
import type { FastifyRequest } from 'fastify';
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
import { audit } from '../admin/index.ts';
import {
  AppError,
  createRateLimiter,
  errors,
  LOGIN_IP_RATE_MAX,
  LOGIN_RATE_WINDOW_MS,
  noStore,
  parseWith,
  pickLang,
} from '../system/index.ts';
import { authFor, currentUser, requireRole, SESSION_COOKIE, SESSION_TTL_SECONDS } from './index.ts';

/** Ошибки полей входа — с понятным текстом, а не общим «проверьте данные». */
const FIELD_MESSAGES: Record<string, string> = {
  phone: 'auth.error.phone',
  code: 'auth.error.codeFormat',
};

const parse = <S extends z.ZodType>(schema: S, body: unknown) =>
  parseWith(schema, body, 'auth', { fieldMessages: FIELD_MESSAGES });

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
  // Лимиты по адресу клиента: перебор номеров и кодов с одной машины. Адрес берётся из соединения;
  // за своим прокси задайте TRUST_PROXY, иначе все клиенты будут выглядеть как адрес прокси.
  const limit = { clock: deps.clock, max: LOGIN_IP_RATE_MAX, windowMs: LOGIN_RATE_WINDOW_MS };
  const requestLimiter = createRateLimiter(limit);
  const verifyLimiter = createRateLimiter(limit);

  app.post('/auth/otp/request', async (req, reply) => {
    noStore(reply);
    requestLimiter.hit(req.ip);
    const { phone } = parse(otpRequestSchema, req.body);
    const sent = await auth.requestOtp(phone, langOf(req));
    return { ok: true as const, ...sent };
  });

  app.post('/auth/otp/verify', async (req, reply) => {
    noStore(reply);
    verifyLimiter.hit(req.ip);
    const { phone, code, lang, attribution } = parse(otpVerifySchema, req.body);
    const { user, token } = auth.verifyOtp(phone, code, lang, attribution);
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
    const before = auth.getUser(id);
    const user = auth.setRole(id, role);
    audit(deps, currentUser(req)!.id, 'user.role', `user:${id}`, {
      from: before?.role ?? null,
      to: user.role,
    });
    return { user };
  });

  app.put('/auth/users/:id/fridges', adminOnly, async (req) => {
    const { fridgeIds } = parse(setFridgesSchema, req.body);
    const id = idOf(req);
    const user = auth.setOperatorFridges(id, fridgeIds);
    audit(deps, currentUser(req)!.id, 'user.fridges', `user:${id}`, {
      fridgeIds: [...new Set(fridgeIds.map(String))],
    });
    return { user };
  });
}
