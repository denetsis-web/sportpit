// Общие помощники тестов growth: приложение с администратором, публичные запросы с разных адресов,
// запись в лист и оплаченные покупки для проверки воронки.
import {
  as,
  codeFromSms,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  requestCode,
  setRole,
  userId,
  verifyCode,
  WRITE,
  type TestApp,
} from '../auth/helpers.ts';

export {
  as,
  codeFromSms,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  requestCode,
  setRole,
  userId,
  verifyCode,
  WRITE,
  type TestApp,
};

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Анонимные номера браузеров: настоящие UUID, как их выдаёт `crypto.randomUUID()`. */
export const ANON_A = '3f8f2c8e-5b1a-4f6e-9d2a-7c1e4b9a0d11';
export const ANON_B = '8a1d5c34-2e7b-4c90-b6f3-0d9e1a7c5b22';

/** Телефон вида +373 60 NNN NNN: у каждого номера свой, чтобы лимит «на номер» не мешал. */
export const phoneN = (n: number) => `+3736${String(n).padStart(7, '0')}`;

export const joinBody = (extra: Record<string, unknown> = {}) => ({
  phone: phoneN(1),
  lang: 'ru',
  consent: true,
  ...extra,
});

interface CallOptions {
  ip?: string;
  cookie?: string;
  /** Без X-Requested-With (общее правило записи). */
  bare?: boolean;
  headers?: Record<string, string>;
}

export function post(test: TestApp, url: string, payload: unknown, options: CallOptions = {}) {
  return test.app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      ...(options.bare ? {} : WRITE),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.ip ? { remoteAddress: options.ip } : {}),
  });
}

export function get(test: TestApp, url: string, options: CallOptions = {}) {
  return test.app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { ...(options.cookie ? { cookie: options.cookie } : {}), ...options.headers },
    ...(options.ip ? { remoteAddress: options.ip } : {}),
  });
}

export function del(test: TestApp, url: string, options: CallOptions = {}) {
  return test.app.inject({
    method: 'DELETE',
    url: `/api/v1${url}`,
    headers: { ...WRITE, ...(options.cookie ? { cookie: options.cookie } : {}) },
  });
}

/** Приложение и вошедший администратор. Телефон администратора — `PHONE`. */
export async function makeAdminApp(): Promise<TestApp & { admin: string }> {
  const test = await makeApp();
  const admin = await login(test, PHONE);
  setRole(test.app, PHONE, 'admin');
  // Вход администратора сам записал бы регистрацию «direct»: убираем её, чтобы счёт в тестах был чистым.
  test.app.deps.db.run('DELETE FROM signup_attribution');
  test.app.deps.db.run('DELETE FROM funnel_events');
  return { ...test, admin };
}

export const attribution = (extra: Record<string, unknown> = {}) => ({
  source: 'tg',
  ...extra,
});

/** Новый пользователь входит с атрибуцией (или без) и получает сессию. */
export async function signUp(
  test: TestApp,
  phone: string,
  attr?: Record<string, unknown> | 'omit',
): Promise<{ id: number; cookie: string }> {
  await requestCode(test, phone);
  const res = await verifyCode(
    test,
    phone,
    codeFromSms(test.sms, phone),
    attr && attr !== 'omit' ? { attribution: attr } : {},
  );
  if (res.statusCode !== 200) throw new Error(`Вход не удался: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'sp_session')!;
  return { id: userId(test.app, phone), cookie: `sp_session=${cookie.value}` };
}

/** Оплаченная покупка напрямую в таблице: оплата в этих тестах не проверяется, нужна только дата `paid_at`. */
export function addPaidPurchase(test: TestApp, user: number, paidAt: string): void {
  test.app.deps.db.run(
    `INSERT INTO purchases (user_id, package_id, boxes, validity_days, list_price_per_box_bani,
       unit_price_bani, total_bani, method, status, idempotency_key, created_at, updated_at, paid_at)
     VALUES (?, 1, 12, 45, 11900, 11900, 142800, 'card', 'paid', ?, ?, ?, ?)`,
    [user, `k-${user}-${paidAt}`, paidAt, paidAt, paidAt],
  );
}

export interface EventRow {
  kind: string;
  source: string;
  ref: string | null;
  campaign: string | null;
  anon_id: string | null;
}

export const eventsOf = (test: TestApp, kind: string): EventRow[] =>
  test.app.deps.db.query<EventRow>(
    'SELECT kind, source, ref, campaign, anon_id FROM funnel_events WHERE kind = ? ORDER BY id',
    [kind],
  );

export const countRows = (test: TestApp, table: string): number =>
  test.app.deps.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;
