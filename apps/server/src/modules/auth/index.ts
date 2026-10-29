// Модуль auth: вход по телефону и коду, сессии, роли, согласия.
// Публичный интерфейс для других модулей:
//   requireRole(...roles)            — preHandler маршрута: 401 без входа, 403 без нужной роли;
//   requireFridgeAccess(source)      — preHandler: оператор действует только над своими холодильниками;
//   assertFridgeAccess(req, id)      — то же императивно (id известен только в теле обработчика);
//   requireConsent(kind)             — preHandler: 403 без действующего согласия (health_data для анкеты);
//   currentUser(req)                 — пользователь запроса или null;
//   authFor(deps)                    — requestOtp, verifyOtp, пользователи, роли, согласия.
// Примеры: app.get('/x', { preHandler: requireRole('admin') }, handler)
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Lang } from '@sportpit/shared/i18n';
import type { ConsentKind, ConsentState } from '@sportpit/shared/schemas/auth';
import type { Role } from '@sportpit/shared/types';
import type { AppDeps } from '../../app.ts';
import { AppError, errors } from '../system/errors.ts';
import { consentStates, hasConsent, recordConsents } from './consents.ts';
import { createOtpService } from './otp.ts';
import { createSessionService, SESSION_COOKIE } from './sessions.ts';
import {
  anonymizeUser,
  createUser,
  findUserById,
  findUserByPhone,
  listUsers,
  replacePhone,
  setOperatorFridges,
  setUserLang,
  setUserRole,
  touchLogin,
  userIdsByRole,
  type AuthUser,
} from './users.ts';

export type { AuthUser } from './users.ts';
export { SESSION_COOKIE, SESSION_TTL_SECONDS } from './sessions.ts';
export { upsertUserWithRole } from './users.ts';

export type AuthDeps = Pick<AppDeps, 'db' | 'clock' | 'config' | 'sms'>;

export interface AuthApi {
  /** Выпускает код и отправляет SMS. 429 при превышении лимитов, 502 при сбое SMS. */
  requestOtp(
    phone: string,
    lang?: Lang,
  ): Promise<{ retryAfterSeconds: number; expiresInSeconds: number }>;
  /** Проверяет код, создаёт пользователя-клиента при первом входе и открывает сессию. */
  verifyOtp(
    phone: string,
    code: string,
    lang?: Lang,
  ): { user: AuthUser; token: string; expiresAt: string };
  /** Закрывает сессию по токену из cookie. */
  logout(token: string | undefined): void;
  userByToken(token: string | undefined): AuthUser | null;
  getUser(id: number): AuthUser | undefined;
  findByPhone(phone: string): AuthUser | undefined;
  listUsers(limit?: number, offset?: number): AuthUser[];
  /** Идентификаторы пользователей роли (например, администраторов для системных уведомлений). */
  userIdsByRole(role: Role): number[];
  setRole(userId: number, role: Role): AuthUser;
  setOperatorFridges(userId: number, fridgeIds: Array<string | number>): AuthUser;
  setLang(userId: number, lang: Lang): AuthUser;
  consents(userId: number): ConsentState[];
  hasConsent(userId: number, kind: ConsentKind): boolean;
  recordConsents(
    userId: number,
    changes: Array<{ kind: ConsentKind; granted: boolean; version: string }>,
  ): ConsentState[];
  /** Смена телефона: код должен быть получен на НОВЫЙ номер (R29.2). */
  changePhone(userId: number, newPhone: string, code: string): AuthUser;
  /** Удаление аккаунта: телефон стирается, сессии закрываются, согласия остаются в истории. */
  anonymizeUser(userId: number): void;
  /** Чистка истёкших кодов и сессий. */
  purgeExpired(): { otp: number; sessions: number };
}

const instances = new WeakMap<object, AuthApi>();

/** Сервис auth для приложения. Один на набор зависимостей: повторный вызов возвращает тот же объект. */
export function authFor(deps: AuthDeps): AuthApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock } = deps;
  const otp = createOtpService({ db, clock, sms: deps.sms, secret: deps.config.sessionSecret });
  const sessions = createSessionService(db, clock);

  const api: AuthApi = {
    requestOtp: (phone, lang = 'ru') => otp.request(phone, lang),
    verifyOtp(phone, code, lang) {
      otp.check(phone, code);
      const user = db.tx((tx) => {
        const existing = findUserByPhone(tx, phone);
        const found = existing ?? createUser(tx, clock, { phone, ...(lang ? { lang } : {}) });
        if (existing && lang) setUserLang(tx, existing.id, lang);
        touchLogin(tx, clock, found.id);
        return findUserById(tx, found.id)!;
      });
      return { user, ...sessions.create(user.id) };
    },
    logout: (token) => sessions.destroy(token),
    userByToken: (token) => sessions.resolve(token),
    getUser: (id) => findUserById(db, id),
    findByPhone: (phone) => findUserByPhone(db, phone),
    listUsers: (limit, offset) => listUsers(db, limit, offset),
    userIdsByRole: (role) => userIdsByRole(db, role),
    setRole: (userId, role) => setUserRole(db, userId, role),
    setOperatorFridges: (userId, fridgeIds) => setOperatorFridges(db, userId, fridgeIds),
    setLang: (userId, lang) => setUserLang(db, userId, lang),
    consents: (userId) => consentStates(db, userId),
    hasConsent: (userId, kind) => hasConsent(db, userId, kind),
    recordConsents: (userId, changes) => recordConsents(db, clock, userId, changes),
    changePhone(userId, newPhone, code) {
      // Сначала код на новый номер, потом занятость: без верного кода занятый и свободный номер
      // неотличимы (иначе вошедший перебирал бы чужие номера без счётчика попыток).
      otp.check(newPhone, code);
      return replacePhone(db, userId, newPhone);
    },
    anonymizeUser: (userId) => anonymizeUser(db, clock, userId),
    purgeExpired: () => ({ otp: otp.purge(), sessions: sessions.purge() }),
  };
  instances.set(deps, api);
  return api;
}

// ---- пользователь запроса ----

function depsOf(req: FastifyRequest): AppDeps {
  return (req.server as unknown as { deps: AppDeps }).deps;
}

const resolved = new WeakMap<FastifyRequest, AuthUser | null>();

/** Пользователь запроса по cookie сессии или null. Результат запоминается на время запроса. */
export function currentUser(req: FastifyRequest): AuthUser | null {
  const known = resolved.get(req);
  if (known !== undefined) return known;
  const token = (req.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE];
  const user = authFor(depsOf(req)).userByToken(token);
  resolved.set(req, user);
  return user;
}

type Hook = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** Нужен вход; с перечнем ролей — ещё и одна из них. 401 без входа, 403 без роли. */
export function requireRole(...roles: Role[]): Hook {
  return async (req) => {
    const user = currentUser(req);
    if (!user) throw errors.unauthorized();
    if (roles.length > 0 && !roles.includes(user.role)) throw errors.forbidden();
  };
}

export type FridgeSource =
  string | number | ((req: FastifyRequest) => string | number | null | undefined);

/** Оператор — только свои холодильники, администратор — любые, остальные роли — нет. */
export function canAccessFridge(user: AuthUser, fridgeId: string | number): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'operator' && user.fridgeIds.includes(String(fridgeId));
}

export function assertFridgeAccess(req: FastifyRequest, fridgeId: string | number): void {
  const user = currentUser(req);
  if (!user) throw errors.unauthorized();
  if (!canAccessFridge(user, fridgeId)) throw errors.forbidden();
}

/** preHandler: идентификатор холодильника — готовое значение или функция от запроса (параметр, тело). */
export function requireFridgeAccess(source: FridgeSource): Hook {
  return async (req) => {
    const id = typeof source === 'function' ? source(req) : source;
    if (id === undefined || id === null || id === '') throw errors.badRequest();
    assertFridgeAccess(req, id);
  };
}

/** preHandler: нужен вход и действующее согласие (например, `health_data` для анкеты). */
export function requireConsent(kind: ConsentKind): Hook {
  return async (req) => {
    const user = currentUser(req);
    if (!user) throw errors.unauthorized();
    if (!authFor(depsOf(req)).hasConsent(user.id, kind)) {
      throw new AppError(403, 'consent_required', 'auth.error.consentRequired');
    }
  };
}
