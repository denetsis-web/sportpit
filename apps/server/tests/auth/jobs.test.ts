import { describe, expect, it } from 'vitest';
import { login, makeApp, OTHER_PHONE } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;

describe('ночная очистка входа', () => {
  it('удаляет истёкшие сессии и старые коды, живые не трогает', async () => {
    const test = await makeApp();
    await login(test); // сессия на 30 дней, код использован
    test.clock.advance(20 * DAY);
    await login(test, OTHER_PHONE); // свежая сессия
    test.clock.advance(11 * DAY); // первой сессии 31 день, второй 11

    expect(test.app.deps.system.scheduler.list().map((j) => j.name)).toContain('auth-cleanup');
    await test.app.deps.system.scheduler.runNow('auth-cleanup');

    const db = test.app.deps.db;
    expect(db.query('SELECT 1 FROM sessions')).toHaveLength(1);
    expect(db.query('SELECT 1 FROM otp_codes')).toHaveLength(0); // обоим кодам больше суток
    expect(db.query('SELECT 1 FROM users')).toHaveLength(2);
  });
});
