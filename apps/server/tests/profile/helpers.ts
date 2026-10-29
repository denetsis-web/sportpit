// Помощники тестов профиля: вход, согласие на данные о здоровье, анкета одной командой.
import { CONSENT_VERSIONS } from '@sportpit/shared/schemas/auth';
import { as, login, WRITE, type TestApp } from '../auth/helpers.ts';

export {
  as,
  codeFromSms,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  userId,
  WRITE,
} from '../auth/helpers.ts';
export type { TestApp } from '../auth/helpers.ts';

export const THIRD_PHONE = '+37379000111';
export const NEW_PHONE = '+37369111222';

/** Мужчина 30 лет, 180 см, 80 кг, похудение, умеренная активность: 2345 ккал (разбор вручную в packages/shared/tests/targets.test.ts). */
export const SAMPLE = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goal: 'lose',
  activity: 'moderate',
  hasCondition: false,
} as const;

export const api = (
  test: TestApp,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  cookie?: string,
  payload?: unknown,
) =>
  test.app.inject({
    method,
    url: `/api/v1${url}`,
    ...(payload !== undefined ? { payload: payload as object } : {}),
    headers: cookie ? as(cookie, method === 'GET' ? {} : WRITE) : method === 'GET' ? {} : WRITE,
  });

export function setHealthConsent(test: TestApp, cookie: string, granted = true) {
  return api(test, 'POST', '/auth/consents', cookie, {
    changes: [{ kind: 'health_data', granted, version: CONSENT_VERSIONS.health_data }],
  });
}

/** Новый клиент с выданным согласием на данные о здоровье. */
export async function clientWithConsent(test: TestApp, phone: string): Promise<string> {
  const cookie = await login(test, phone);
  test.clock.advance(2 * 60 * 1000); // следующий вход не упрётся в лимит кодов
  const res = await setHealthConsent(test, cookie);
  if (res.statusCode !== 200) throw new Error(`Согласие не записано: ${res.body}`);
  return cookie;
}
