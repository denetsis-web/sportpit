// Общие помощники тестов администрирования: приложение, вход администратора и обычного клиента.
import type { AppInstance } from '../../src/app.ts';
import {
  as,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  setRole,
  userId,
  WRITE,
  type TestApp,
} from '../auth/helpers.ts';

export { as, makeApp, OTHER_PHONE, PHONE, userId, WRITE, type TestApp };

export interface AdminTest extends TestApp {
  /** Cookie администратора. */
  admin: string;
  adminId: number;
  /** Cookie обычного клиента. */
  client: string;
}

/** Приложение с двумя вошедшими пользователями: администратор и клиент. */
export async function makeAdminApp(): Promise<AdminTest> {
  const test = await makeApp();
  const admin = await login(test, PHONE);
  setRole(test.app, PHONE, 'admin');
  const client = await login(test, OTHER_PHONE);
  return { ...test, admin, adminId: userId(test.app, PHONE), client };
}

export function call(
  app: AppInstance,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  cookie?: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: cookie ? as(cookie, WRITE) : WRITE,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

export const GYM = { name: 'Зал «Тест»', sharePercent: 12.5 } as const;

export async function createGym(
  test: AdminTest,
  body: Record<string, unknown> = GYM,
): Promise<{ id: string; name: string }> {
  const res = await call(test.app, 'POST', '/admin/gyms', test.admin, body);
  if (res.statusCode !== 201) throw new Error(`Зал не создан: ${res.statusCode} ${res.body}`);
  return res.json();
}

export async function createFridge(
  test: AdminTest,
  gymId: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const res = await call(test.app, 'POST', '/admin/fridges', test.admin, {
    gymId,
    name: 'Холодильник у входа',
    capacityBoxes: 40,
    ...body,
  });
  if (res.statusCode !== 201)
    throw new Error(`Холодильник не создан: ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Записи журнала действий напрямую из базы: порядок от старых к новым. */
export function auditRows(app: AppInstance) {
  return app.deps.db.query<{
    user_id: number | null;
    action: string;
    target: string;
    detail: string | null;
  }>('SELECT user_id, action, target, detail FROM admin_audit ORDER BY id');
}
