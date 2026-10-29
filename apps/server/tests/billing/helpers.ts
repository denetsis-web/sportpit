// Помощники тестов billing: приложение с управляемой заглушкой шлюза, вход клиента и администратора,
// покупка «одной командой» и сверка баланса с журналом.
import { afterEach } from 'vitest';
import { buildApp, type AppInstance } from '../../src/app.ts';
import { StubPaymentGateway, StubSmsSender } from '../../src/modules/adapters/index.ts';
import { billingFor, type BillingApi } from '../../src/modules/billing/index.ts';
import { createManualClock, type ManualClock } from '../../src/modules/clock/index.ts';
import type { PaymentStatus } from '../../src/modules/adapters/payment.ts';
import { as, login, OTHER_PHONE, PHONE, setRole, userId, WRITE } from '../auth/helpers.ts';

export { WRITE, OTHER_PHONE, PHONE };
export const THIRD_PHONE = '+37367111222';
export const DAY = 24 * 60 * 60 * 1000;

export interface BillingTest {
  app: AppInstance;
  sms: StubSmsSender;
  clock: ManualClock;
  stub: StubPaymentGateway;
  billing: BillingApi;
  /** Cookie администратора и клиента. */
  admin: string;
  adminId: number;
  client: string;
  clientId: number;
}

const open: AppInstance[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

export async function makeBillingApp(
  options: { outcome?: PaymentStatus; clock?: ManualClock; start?: string } = {},
): Promise<BillingTest> {
  const sms = new StubSmsSender({ silent: true });
  const clock = options.clock ?? createManualClock(options.start ?? '2026-03-10T09:00:00Z');
  const stub = new StubPaymentGateway({ outcome: options.outcome ?? 'paid' });
  const app = await buildApp({ clock, sms, payment: stub });
  open.push(app);
  const base = { app, sms, clock };
  const admin = await login(base, PHONE);
  setRole(app, PHONE, 'admin');
  const client = await login(base, OTHER_PHONE);
  return {
    ...base,
    stub,
    billing: billingFor(app.deps),
    admin,
    adminId: userId(app, PHONE),
    client,
    clientId: userId(app, OTHER_PHONE),
  };
}

/** Новый вход администратора: сессия живёт 30 дней, а сценарии со сроками длиннее. */
export const freshAdmin = (test: BillingTest): Promise<string> => login(test, PHONE);

/** Ещё один вошедший клиент. */
export async function addClient(test: BillingTest, phone = THIRD_PHONE) {
  const cookie = await login(test, phone);
  return { cookie, id: userId(test.app, phone) };
}

export function call(
  test: Pick<BillingTest, 'app'>,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  cookie?: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return test.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(cookie ? as(cookie, WRITE) : WRITE), ...headers },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

let keySeq = 0;
export const newKey = () => `test-key-${++keySeq}-${Math.random().toString(36).slice(2, 10)}`;

/** Идентификатор пакета на `boxes` боксов из стартовых данных. */
export function packageId(test: BillingTest, boxes: number): number {
  return test.app.deps.db.get<{ id: number }>(
    'SELECT id FROM packages WHERE boxes = ? ORDER BY id LIMIT 1',
    [boxes],
  )!.id;
}

export interface PurchaseBody {
  purchase: {
    id: number;
    status: 'pending' | 'paid' | 'failed';
    failureCode: string | null;
    failureReason: string | null;
    totalBani: number;
    unitPriceBani: number;
    discountBani: number;
    boxes: number;
    redirectUrl: string | null;
    stubGateway: boolean;
    carriedOver: number;
    expiresAt: string | null;
    promoCode: string | null;
  };
}

export async function buy(
  test: BillingTest,
  cookie: string,
  boxes: number,
  extra: { promoCode?: string; method?: 'card' | 'mia'; idempotencyKey?: string } = {},
) {
  const res = await call(test, 'POST', '/purchases', cookie, {
    packageId: packageId(test, boxes),
    method: extra.method ?? 'card',
    idempotencyKey: extra.idempotencyKey ?? newKey(),
    ...(extra.promoCode ? { promoCode: extra.promoCode } : {}),
  });
  return { res, body: res.json() as PurchaseBody };
}

/** Колбэк, как будто его прислал шлюз: заглушка меняет исход и выдаёт тело. */
export function gatewayCallback(test: BillingTest, providerPaymentId: string) {
  return test.app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/payment',
    headers: test.stub.callbackFor(providerPaymentId).headers as Record<string, string>,
    payload: test.stub.callbackFor(providerPaymentId).body as object,
  });
}

export function providerPaymentIdOf(test: BillingTest, purchaseId: number): string {
  return test.app.deps.db.get<{ p: string }>(
    'SELECT provider_payment_id AS p FROM purchases WHERE id = ?',
    [purchaseId],
  )!.p;
}

/** Покупка, оплаченная до конца (заглушка отвечает «оплачено» сразу). Возвращает покупку из ответа. */
export async function buyPaid(
  test: BillingTest,
  cookie: string,
  boxes: number,
  extra: Parameters<typeof buy>[3] = {},
) {
  const { res, body } = await buy(test, cookie, boxes, extra);
  if (body.purchase?.status !== 'paid') {
    throw new Error(`Покупка не оплачена: ${res.statusCode} ${res.body}`);
  }
  return body.purchase;
}

// ---- сверка с журналом ----

export function journalSum(test: BillingTest, uid: number): number {
  return test.app.deps.db.get<{ n: number }>(
    'SELECT COALESCE(SUM(delta), 0) AS n FROM credit_ledger WHERE user_id = ?',
    [uid],
  )!.n;
}

export function lotsOf(test: BillingTest, uid: number) {
  return test.app.deps.db.query<{
    id: number;
    source: string;
    credits: number;
    unit_price_bani: number;
    expires_at: string;
    expired_at: string | null;
    remaining: number;
  }>(
    `SELECT l.id, l.source, l.credits, l.unit_price_bani, l.expires_at, l.expired_at,
            COALESCE(SUM(e.delta), 0) AS remaining
       FROM credit_lots l LEFT JOIN credit_ledger e ON e.lot_id = l.id
      WHERE l.user_id = ? GROUP BY l.id ORDER BY l.id`,
    [uid],
  );
}

export function ledgerRows(test: BillingTest, uid: number) {
  return test.app.deps.db.query<{
    id: number;
    lot_id: number | null;
    delta: number;
    reason: string;
    order_id: string | null;
    memo: string | null;
  }>(
    'SELECT id, lot_id, delta, reason, order_id, memo FROM credit_ledger WHERE user_id = ? ORDER BY id',
    [uid],
  );
}

export const balanceApi = async (test: BillingTest, cookie: string): Promise<number> =>
  (await call(test, 'GET', '/credits', cookie)).json().balance;
