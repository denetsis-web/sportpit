// Общие помощники тестов входа: приложение с заглушкой SMS и управляемым временем, вход одной командой.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';
import { buildApp, type AppInstance } from '../../src/app.ts';
import { StubSmsSender } from '../../src/modules/adapters/index.ts';
import { createManualClock, type ManualClock } from '../../src/modules/clock/index.ts';
import { loadConfig, type Config } from '../../src/modules/system/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const GATE_MODULES = join(here, 'fixtures', 'modules');

export const WRITE = { 'x-requested-with': 'sportpit' };
export const SESSION_COOKIE = 'sp_session';
export const PHONE = '+37360123456';
export const OTHER_PHONE = '+37369876543';

export interface TestApp {
  app: AppInstance;
  sms: StubSmsSender;
  clock: ManualClock;
}

const open: AppInstance[] = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

export async function makeApp(
  options: { config?: Config; clock?: ManualClock; sms?: StubSmsSender } = {},
): Promise<TestApp> {
  const sms = options.sms ?? new StubSmsSender({ silent: true });
  const clock = options.clock ?? createManualClock('2026-03-10T09:00:00Z');
  const app = await buildApp({
    clock,
    sms,
    extraModulesDirs: [GATE_MODULES],
    ...(options.config ? { config: options.config } : {}),
  });
  open.push(app);
  return { app, sms, clock };
}

export function productionConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'production',
    FILE_STORAGE: 'memory',
    SESSION_SECRET: 'test-only-secret-not-real',
    PUBLIC_BASE_URL: 'https://example.invalid',
    ...overrides,
  });
}

/** Код из последней SMS на номер. */
export function codeFromSms(sms: StubSmsSender, phone = PHONE): string {
  const text = sms.last(phone)?.text ?? '';
  const match = /\b(\d{6})\b/.exec(text);
  if (!match) throw new Error(`В SMS на ${phone} нет кода: «${text}»`);
  return match[1]!;
}

export async function requestCode(
  { app }: Pick<TestApp, 'app'>,
  phone = PHONE,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/request',
    payload: { phone },
    headers: { ...WRITE, ...headers },
  });
}

export async function verifyCode(
  { app }: Pick<TestApp, 'app'>,
  phone: string,
  code: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    payload: { phone, code, ...extra },
    headers: { ...WRITE, ...headers },
  });
}

/** Полный вход: код, проверка, cookie сессии в виде строки для заголовка. */
export async function login(test: TestApp, phone = PHONE): Promise<string> {
  const requested = await requestCode(test, phone);
  if (requested.statusCode !== 200) throw new Error(`Код не отправлен: ${requested.body}`);
  const verified = await verifyCode(test, phone, codeFromSms(test.sms, phone));
  if (verified.statusCode !== 200) throw new Error(`Вход не удался: ${verified.body}`);
  const cookie = verified.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error('Cookie сессии не выдана');
  return `${SESSION_COOKIE}=${cookie.value}`;
}

export function as(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie, ...extra };
}

export function setRole(app: AppInstance, phone: string, role: string): void {
  app.deps.db.run('UPDATE users SET role = ? WHERE phone = ?', [role, phone]);
}

export function userId(app: AppInstance, phone: string): number {
  return app.deps.db.get<{ id: number }>('SELECT id FROM users WHERE phone = ?', [phone])!.id;
}
