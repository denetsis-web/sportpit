// Маршруты профиля: /api/v1/profile/*. Все — только для вошедшего и только про него самого.
// Данные о здоровье не кэшируются (cache-control: no-store).
import {
  deleteAccountSchema,
  phoneChangeConfirmSchema,
  phoneChangeRequestSchema,
  profileInputSchema,
} from '@sportpit/shared/schemas/profile';
import type { AppDeps, AppInstance } from '../../app.ts';
import {
  authFor,
  currentUser,
  requireConsent,
  requireRole,
  SESSION_COOKIE,
} from '../auth/index.ts';
import {
  AppError,
  createRateLimiter,
  LOGIN_RATE_MAX,
  LOGIN_RATE_WINDOW_MS,
  noStore,
} from '../system/index.ts';
import { profileFor } from './index.ts';

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const profile = profileFor(deps);
  const auth = authFor(deps);
  const guard = { preHandler: requireRole() };
  const me = (req: Parameters<typeof currentUser>[0]) => currentUser(req)!;
  // запросы кода на новые номера: по пользователю, чтобы вошедший не рассылал SMS на чужие номера
  const phoneLimiter = createRateLimiter({
    clock: deps.clock,
    max: LOGIN_RATE_MAX,
    windowMs: LOGIN_RATE_WINDOW_MS,
  });

  app.get('/profile', guard, async (req, reply) => {
    noStore(reply);
    return profile.getProfile(me(req).id);
  });

  // Параметры тела — данные о здоровье: без согласия health_data сервер отвечает 403 (R16.1).
  app.put(
    '/profile',
    { preHandler: [requireRole(), requireConsent('health_data')] },
    async (req, reply) => {
      noStore(reply);
      return profile.saveProfile(me(req).id, profileInputSchema.parse(req.body ?? {}));
    },
  );

  app.delete('/profile', guard, async (req, reply) => {
    noStore(reply);
    profile.deleteProfile(me(req).id);
    return { ok: true };
  });

  // ---- смена телефона: код уходит на НОВЫЙ номер, номер меняется только после его ввода (R29.2) ----

  app.post('/profile/phone/request', guard, async (req, reply) => {
    noStore(reply);
    const user = me(req);
    phoneLimiter.hit(String(user.id));
    const { phone } = phoneChangeRequestSchema.parse(req.body ?? {});
    if (phone === user.phone) throw new AppError(400, 'phone_same', 'profile.error.phoneSame');
    // Занят ли номер, здесь не проверяется и не сообщается: иначе любой вошедший перебирал бы чужие
    // номера. Код уходит владельцу номера, «номер занят» — только после верного кода (см. changePhone).
    const sent = await auth.requestOtp(phone, user.lang);
    return { ok: true as const, ...sent };
  });

  app.post('/profile/phone', guard, async (req, reply) => {
    noStore(reply);
    const user = me(req);
    const { phone, code } = phoneChangeConfirmSchema.parse(req.body ?? {});
    if (phone === user.phone) throw new AppError(400, 'phone_same', 'profile.error.phoneSame');
    return { user: auth.changePhone(user.id, phone, code) };
  });

  // ---- выгрузка данных (R29.1) ----

  app.get('/profile/export', guard, async (req, reply) => {
    noStore(reply);
    const data = await profile.exportData(me(req).id);
    return reply
      .header('content-disposition', 'attachment; filename="sportpit-data.json"')
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(data, null, 2));
  });

  // ---- удаление аккаунта (R29): только с явным подтверждением ----

  app.post('/profile/account/delete', guard, async (req, reply) => {
    noStore(reply);
    const parsed = deleteAccountSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      throw new AppError(400, 'confirm_required', 'profile.error.confirmRequired');
    const user = me(req);
    profile.deleteAccount(user.id);
    reply.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: deps.config.publicBaseUrl.startsWith('https://'),
    });
    return { ok: true };
  });
}
