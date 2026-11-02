// Безопасный запуск в production (F1.1): заглушки, http-адрес и пустой секрет не пускают сервер в бой.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppInstance } from '../src/app.ts';
import {
  StubPaymentGateway,
  StubSmsSender,
  type CallbackInput,
  type PaymentGateway,
} from '../src/modules/adapters/index.ts';
import {
  assertProductionConfig,
  loadConfig,
  productionProblems,
} from '../src/modules/system/index.ts';
import { createManualClock } from '../src/modules/clock/index.ts';
import { as, login, PHONE, WRITE } from './auth/helpers.ts';

const SAFE_ENV = {
  NODE_ENV: 'production',
  FILE_STORAGE: 'memory',
  SESSION_SECRET: 'test-only-secret-not-real',
  PUBLIC_BASE_URL: 'https://example.invalid',
};

const open: AppInstance[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (open.length) await open.pop()!.close();
});

describe('запуск в production: проверка конфигурации', () => {
  it('заглушки оплаты и SMS без флага — отказ с понятным текстом про каждую причину', () => {
    const config = loadConfig(SAFE_ENV);
    const problems = productionProblems(config);
    expect(problems.join('\n')).toContain('PAYMENT_PROVIDER');
    expect(problems.join('\n')).toContain('SMS_PROVIDER');
    expect(() => assertProductionConfig(config)).toThrow(/ALLOW_STUB_IN_PRODUCTION/);
  });

  it('PUBLIC_BASE_URL без https:// — отказ', () => {
    const config = loadConfig({ ...SAFE_ENV, PUBLIC_BASE_URL: 'http://example.invalid' });
    expect(productionProblems(config).join('\n')).toContain('PUBLIC_BASE_URL');
    expect(() => assertProductionConfig(config)).toThrow(/PUBLIC_BASE_URL/);
  });

  it('с флагом ALLOW_STUB_IN_PRODUCTION=1 заглушки и http допустимы, запуск идёт', () => {
    const config = loadConfig({
      ...SAFE_ENV,
      PUBLIC_BASE_URL: 'http://example.invalid',
      ALLOW_STUB_IN_PRODUCTION: '1',
    });
    expect(config.allowStubInProduction).toBe(true);
    expect(productionProblems(config)).toEqual([]);
    expect(() => assertProductionConfig(config)).not.toThrow();
  });

  it('без SESSION_SECRET отказ даже с флагом', () => {
    const { SESSION_SECRET: _omit, ...withoutSecret } = SAFE_ENV;
    const config = loadConfig({ ...withoutSecret, ALLOW_STUB_IN_PRODUCTION: '1' });
    expect(() => assertProductionConfig(config)).toThrow(/SESSION_SECRET/);
  });

  it('вне production проверка ничего не требует', () => {
    expect(productionProblems(loadConfig({ NODE_ENV: 'development' }))).toEqual([]);
    expect(productionProblems(loadConfig({}))).toEqual([]);
  });

  it('текст отказа не содержит значения секрета', () => {
    const config = loadConfig({ ...SAFE_ENV, SESSION_SECRET: 'canary-secret-777' });
    let message = '';
    try {
      assertProductionConfig(config);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('canary-secret-777');
  });
});

describe('заглушка SMS в production не пишет коды в журнал процесса', () => {
  async function requestCodeLogs(nodeEnv: string): Promise<string[]> {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const config = loadConfig({ ...SAFE_ENV, NODE_ENV: nodeEnv, ALLOW_STUB_IN_PRODUCTION: '1' });
    const app = await buildApp({ config });
    open.push(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: PHONE },
      headers: WRITE,
    });
    expect(res.statusCode).toBe(200);
    return log.mock.calls.map((call) => String(call[0]));
  }

  it('production: ни одной строки с кодом', async () => {
    expect(await requestCodeLogs('production')).toEqual([]);
  });

  it('development: код виден в консоли (так работает разработка)', async () => {
    const lines = await requestCodeLogs('development');
    expect(lines.some((line) => line.startsWith('[sms-stub]'))).toBe(true);
  });
});

/** Боевой шлюз «снаружи» (provider не stub), но разбирающий колбэки как заглушка: ловит обход проверки. */
function fakeRealGateway(inner: StubPaymentGateway): PaymentGateway {
  return {
    provider: 'maib',
    createPayment: (request) => inner.createPayment(request),
    getPayment: (id) => inner.getPayment(id),
    refund: (request) => inner.refund(request),
    parseCallback: (input: CallbackInput) => inner.parseCallback(input),
  };
}

describe('страница и колбэк заглушки при боевом шлюзе', () => {
  async function setup() {
    const inner = new StubPaymentGateway({ outcome: 'pending' });
    const sms = new StubSmsSender({ silent: true });
    const clock = createManualClock('2026-03-10T09:00:00Z');
    const app = await buildApp({ payment: fakeRealGateway(inner), sms, clock });
    open.push(app);
    const cookie = await login({ app, sms, clock }, PHONE);
    const packageId = app.deps.db.get<{ id: number }>(
      'SELECT id FROM packages ORDER BY id LIMIT 1',
    )!.id;
    const bought = await app.inject({
      method: 'POST',
      url: '/api/v1/purchases',
      headers: as(cookie, WRITE),
      payload: { packageId, method: 'card', idempotencyKey: 'prod-test-key-1' },
    });
    expect(bought.statusCode).toBe(201);
    const purchaseId = bought.json().purchase.id as number;
    const providerPaymentId = app.deps.db.get<{ p: string }>(
      'SELECT provider_payment_id AS p FROM purchases WHERE id = ?',
      [purchaseId],
    )!.p;
    return { app, cookie, purchaseId, providerPaymentId };
  }

  it('колбэк с подписью «stub» отвечает 404 и кредитов не даёт', async () => {
    const { app, purchaseId, providerPaymentId } = await setup();
    const callback = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/payment',
      headers: { 'x-stub-signature': 'stub' },
      payload: { providerPaymentId, status: 'paid', eventId: 'forged-1' },
    });
    expect(callback.statusCode).toBe(404);
    expect(
      app.deps.db.get<{ status: string }>('SELECT status FROM purchases WHERE id = ?', [
        purchaseId,
      ])!.status,
    ).toBe('pending');
  });

  it('stub-pay отвечает 404 и покупку не оплачивает', async () => {
    const { app, cookie, purchaseId } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/purchases/${purchaseId}/stub-pay`,
      headers: as(cookie, WRITE),
      payload: { outcome: 'paid' },
    });
    expect(res.statusCode).toBe(404);
    expect(
      app.deps.db.get<{ status: string }>('SELECT status FROM purchases WHERE id = ?', [
        purchaseId,
      ])!.status,
    ).toBe('pending');
  });
});
