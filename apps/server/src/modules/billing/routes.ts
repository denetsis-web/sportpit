// Маршруты billing: /api/v1/packages, /credits, /promo, /purchases, /admin/{packages,promos,purchases,refunds}
// и вход колбэков шлюза /api/v1/webhooks/payment (без X-Requested-With: его шлёт банк, не браузер).
// Данные карты ни в один маршрут не приходят: оплата идёт на странице шлюза.
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  packageCreateSchema,
  packageUpdateSchema,
  promoApplySchema,
  promoCreateSchema,
  promoUpdateSchema,
  purchaseCreateSchema,
  refundCreateSchema,
  stubPaySchema,
} from '@sportpit/shared/schemas/billing';
import type { AppDeps, AppInstance } from '../../app.ts';
import { currentUser, requireRole } from '../auth/index.ts';
import { profileFor } from '../profile/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { noStore, parseWith } from '../system/http.ts';
import { EVENT_KINDS, errorDetail } from '../system/events.ts';
import { auditFor, setAuditSink } from './audit.ts';
import { billingFor } from './index.ts';
import { getPurchaseRow } from './purchases.ts';

const parse = <S extends z.ZodType>(schema: S, body: unknown) => parseWith(schema, body, 'billing');

/** Номер из адреса; не число — как «не найдено». */
function idParam(req: FastifyRequest, name = 'id'): number {
  const raw = (req.params as Record<string, string>)[name] ?? '';
  const id = Number(raw);
  if (!/^\d{1,12}$/.test(raw) || !Number.isSafeInteger(id) || id <= 0) throw errors.notFound();
  return id;
}

/** Перебор промокодов: после 10 неудач за 15 минут клиент ждёт. Память процесса — одного достаточно. */
function createPromoGuard(deps: AppDeps) {
  const WINDOW_MS = 15 * 60_000;
  const MAX_FAILURES = 10;
  const failures = new Map<number, { count: number; resetAt: number }>();
  return {
    check(userId: number): void {
      const entry = failures.get(userId);
      const now = deps.clock.now().getTime();
      if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
        throw errors.rateLimited(Math.ceil((entry.resetAt - now) / 1000));
      }
    },
    fail(userId: number): void {
      const now = deps.clock.now().getTime();
      const entry = failures.get(userId);
      if (!entry || entry.resetAt <= now)
        failures.set(userId, { count: 1, resetAt: now + WINDOW_MS });
      else entry.count += 1;
    },
  };
}

/** Подпись, которую заглушка шлюза принимает в колбэке (см. adapters/payment.ts). */
const STUB_SIGNATURE_HEADERS = { 'x-stub-signature': 'stub' };

export async function registerRoutes(app: AppInstance, deps: AppDeps): Promise<void> {
  const billing = billingFor(deps);
  const guard = { preHandler: requireRole() };
  const adminGuard = { preHandler: requireRole('admin') };
  const user = (req: FastifyRequest): number => currentUser(req)!.id;
  const promoGuard = createPromoGuard(deps);

  // Журнал действий администратора: подключаем admin.audit, если модуль есть; иначе шов остаётся пустым.
  try {
    const admin = await import('../admin/index.ts');
    setAuditSink(deps, (userId, action, target, detail) =>
      admin.audit(deps, userId, action, target, detail),
    );
  } catch (error) {
    app.log.warn(
      { err: errorDetail(error) },
      'admin.audit недоступен, действия не пишутся в журнал',
    );
  }
  const audit = (
    req: FastifyRequest,
    action: string,
    target: string,
    detail?: Record<string, unknown>,
  ): void => {
    try {
      auditFor(deps)(user(req), action, target, detail);
    } catch (error) {
      // сбой журнала не отменяет уже выполненную денежную операцию, но не остаётся незамеченным
      deps.system.logEvent(EVENT_KINDS.serverError, {
        where: 'billing/audit',
        ...errorDetail(error),
      });
    }
  };

  // Данные клиента для «Выгрузить мои данные» (R29.1).
  profileFor(deps).registerExportProvider('billing', (userId) => ({
    purchases: deps.db.query<Record<string, unknown>>(
      `SELECT id, boxes, unit_price_bani AS unitPriceBani, total_bani AS totalBani, status,
                method, created_at AS createdAt, paid_at AS paidAt
           FROM purchases WHERE user_id = ? ORDER BY id`,
      [userId],
    ),
    creditLedger: billing.ledger(userId, 200),
  }));

  // ---- клиент ----

  app.get('/packages', async (_req, reply) => {
    noStore(reply);
    return { items: billing.listPackages() };
  });

  app.get('/credits', guard, async (req, reply) => {
    noStore(reply);
    return billing.balanceDetails(user(req));
  });

  app.get('/credits/history', guard, async (req, reply) => {
    noStore(reply);
    const userId = user(req);
    const limit = Number((req.query as { limit?: string }).limit ?? 50);
    return {
      balance: billing.balance(userId),
      items: billing.ledger(userId, Number.isFinite(limit) ? limit : 50),
    };
  });

  app.post('/promo/apply', guard, async (req, reply) => {
    noStore(reply);
    const userId = user(req);
    const { code, packageId } = parse(promoApplySchema, req.body);
    promoGuard.check(userId);
    try {
      return billing.applyPromo(userId, code, packageId);
    } catch (error) {
      if (error instanceof AppError && error.code.startsWith('promo_')) promoGuard.fail(userId);
      throw error;
    }
  });

  app.post('/purchases', guard, async (req, reply) => {
    noStore(reply);
    const input = parse(purchaseCreateSchema, req.body);
    if (input.promoCode) promoGuard.check(user(req));
    try {
      const { purchase, created } = await billing.startPurchase(user(req), input);
      return reply.code(created ? 201 : 200).send({ purchase });
    } catch (error) {
      if (error instanceof AppError && error.code.startsWith('promo_')) promoGuard.fail(user(req));
      throw error;
    }
  });

  app.get('/purchases', guard, async (req, reply) => {
    noStore(reply);
    const rows = deps.db.query<{ id: number }>(
      'SELECT id FROM purchases WHERE user_id = ? ORDER BY id DESC LIMIT 20',
      [user(req)],
    );
    const items = [];
    for (const row of rows) items.push(await billing.getPurchase(user(req), row.id));
    return { items };
  });

  app.get('/purchases/:id', guard, async (req, reply) => {
    noStore(reply);
    return { purchase: await billing.getPurchase(user(req), idParam(req)) };
  });

  app.post('/purchases/:id/cancel', guard, async (req, reply) => {
    noStore(reply);
    return { purchase: await billing.cancelPurchase(user(req), idParam(req)) };
  });

  // Страница заглушки шлюза: «Оплатить» и «Отклонить». Работает только с заглушкой оплаты;
  // результат проходит тем же путём, что и настоящий колбэк банка.
  app.post('/purchases/:id/stub-pay', guard, async (req, reply) => {
    noStore(reply);
    if (deps.payment.provider !== 'stub') throw errors.notFound();
    const id = idParam(req);
    const { outcome } = parse(stubPaySchema, req.body);
    const row = getPurchaseRow(deps.db, id);
    if (!row || row.user_id !== user(req)) throw errors.notFound('billing.error.purchaseNotFound');
    if (row.status === 'pending' && row.provider_payment_id) {
      billing.handleGatewayCallback({
        headers: STUB_SIGNATURE_HEADERS,
        body: {
          providerPaymentId: row.provider_payment_id,
          status: outcome,
          eventId: `stub-page:${row.id}:${outcome}`,
          amountBani: row.total_bani,
          currency: 'MDL',
          ...(outcome === 'failed' ? { failureReason: 'Отклонено на странице заглушки' } : {}),
        },
      });
    }
    return { purchase: await billing.getPurchase(user(req), id) };
  });

  // ---- колбэк шлюза ----

  app.post('/webhooks/payment', async (req, reply) => {
    noStore(reply);
    // подпись заглушки принимает только заглушка: боевой шлюз не должен пропускать «stub»
    if (deps.payment.provider !== 'stub' && req.headers['x-stub-signature'] !== undefined) {
      throw errors.notFound();
    }
    const { duplicate } = billing.handleGatewayCallback({
      body: req.body,
      headers: req.headers,
    });
    return reply.code(200).send({ ok: true, duplicate });
  });

  // ---- администратор: пакеты ----

  app.get('/admin/packages', adminGuard, async (_req, reply) => {
    noStore(reply);
    return { items: billing.listPackages({ includeInactive: true }) };
  });

  app.post('/admin/packages', adminGuard, async (req, reply) => {
    const input = parse(packageCreateSchema, req.body);
    const created = billing.createPackage(input);
    audit(req, 'package.create', `package:${created.id}`, {
      boxes: created.boxes,
      pricePerBoxBani: created.pricePerBoxBani,
    });
    return reply.code(201).send({ package: created });
  });

  app.patch('/admin/packages/:id', adminGuard, async (req) => {
    const id = idParam(req);
    const patch = parse(packageUpdateSchema, req.body);
    const updated = billing.updatePackage(id, patch);
    audit(req, 'package.update', `package:${id}`, { ...patch });
    return { package: updated };
  });

  // ---- администратор: промокоды ----

  app.get('/admin/promos', adminGuard, async (_req, reply) => {
    noStore(reply);
    return { items: billing.listPromos() };
  });

  app.post('/admin/promos', adminGuard, async (req, reply) => {
    const input = parse(promoCreateSchema, req.body);
    const created = billing.createPromo(input);
    audit(req, 'promo.create', `promo:${created.id}`, { code: created.code, kind: created.kind });
    return reply.code(201).send({ promo: created });
  });

  app.patch('/admin/promos/:id', adminGuard, async (req) => {
    const id = idParam(req);
    const patch = parse(promoUpdateSchema, req.body);
    const updated = billing.updatePromo(id, patch);
    audit(req, 'promo.update', `promo:${id}`, { ...patch });
    return { promo: updated };
  });

  // ---- администратор: покупки и возвраты ----

  app.get('/admin/purchases', adminGuard, async (req, reply) => {
    noStore(reply);
    const q = req.query as { q?: string; limit?: string; offset?: string };
    return {
      items: billing.listAdminPurchases({
        ...(q.q ? { q: q.q } : {}),
        limit: Number(q.limit ?? 50) || 50,
        offset: Number(q.offset ?? 0) || 0,
      }),
    };
  });

  app.get('/admin/refunds', adminGuard, async (req, reply) => {
    noStore(reply);
    const q = req.query as { limit?: string; offset?: string };
    return {
      items: billing.listRefunds({
        limit: Number(q.limit ?? 50) || 50,
        offset: Number(q.offset ?? 0) || 0,
      }),
    };
  });

  app.post('/admin/refunds', adminGuard, async (req, reply) => {
    noStore(reply);
    const input = parse(refundCreateSchema, req.body);
    const refund = await billing.refund(user(req), input);
    audit(req, 'refund.create', `purchase:${input.purchaseId}`, {
      refundId: refund.id,
      credits: refund.credits,
      amountBani: refund.amountBani,
      status: refund.status,
      reason: input.reason,
    });
    return reply.code(201).send({ refund });
  });

  app.post('/admin/refunds/:id/retry', adminGuard, async (req, reply) => {
    noStore(reply);
    const refund = await billing.retryRefund(idParam(req));
    audit(req, 'refund.retry', `refund:${refund.id}`, { status: refund.status });
    return { refund };
  });
}
