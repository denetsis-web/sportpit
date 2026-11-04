// Сквозной путь ветки роста: страница `/` → события и запись в лист → список администратора → воронка.
// Ожидаемые числа записаны руками из сценария ниже, а не посчитаны теми же функциями, что в коде.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@sportpit/shared/i18n';
import { buildApp, type AppInstance } from '../../src/app.ts';
import { StubSmsSender } from '../../src/modules/adapters/index.ts';
import { createManualClock } from '../../src/modules/clock/index.ts';
import {
  ANON_A,
  ANON_B,
  attribution,
  get,
  joinBody,
  login,
  PHONE,
  phoneN,
  post,
  setRole,
  type TestApp,
} from './helpers.ts';

const SHELL =
  '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8" />\n<title>SportPit</title>\n</head>\n<body><div id="root"></div></body>\n</html>';

const open: AppInstance[] = [];
const cleanup: Array<() => void> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (cleanup.length) cleanup.pop()!();
});

/** Приложение с раздачей собранного клиента: так отвечает боевой сервер на `/`. */
async function makeServedApp(): Promise<TestApp> {
  const dist = mkdtempSync(join(tmpdir(), 'sportpit-journey-'));
  cleanup.push(() => rmSync(dist, { recursive: true, force: true }));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), SHELL);
  const sms = new StubSmsSender({ silent: true });
  const clock = createManualClock('2026-03-10T09:00:00Z');
  const app = await buildApp({ clock, sms, webDistDir: dist, serveWeb: true });
  open.push(app);
  return { app, sms, clock };
}

const track = (test: TestApp, kind: string, attr: Record<string, unknown>) =>
  post(test, '/track', { kind, attribution: attr });

describe('путь: страница → запись → список → воронка', () => {
  it('гость приходит из Telegram, считает норму, записывается; администратор видит запись и воронку', async () => {
    const test = await makeServedApp();

    // 1. SEO-страница: сервер отдаёт лендинг с мета-тегами, доступно без входа.
    const page = await test.app.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(`<title>${t('ru', 'landing.meta.title')}</title>`);

    // 2. Гость из Telegram (Ион, с аналитикой): просмотр, расчёт нормы, запись в лист.
    const ion = attribution({ source: 'tg', ref: 'ion', campaign: 'nov', anonId: ANON_A });
    expect((await track(test, 'landing_view', ion)).statusCode).toBe(204);
    expect((await track(test, 'calc_used', ion)).statusCode).toBe(204);
    // пересчитал норму ещё раз: событий два, человек один
    expect((await track(test, 'calc_used', ion)).statusCode).toBe(204);
    test.clock.advance(60_000);
    const joined = await post(
      test,
      '/waitlist',
      joinBody({
        phone: phoneN(1),
        name: 'Ион',
        gym: 'Alpha Gym',
        goal: 'lose',
        attribution: ion,
      }),
    );
    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toEqual({ ok: true });

    // Тот же человек пробует ещё раз: ответ тот же, в листе и воронке ничего не добавляется.
    const again = await post(test, '/waitlist', joinBody({ phone: phoneN(1), attribution: ion }));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ ok: true });

    // 3. Гость из зала без согласия на аналитику: просмотр и запись, без анонимного номера.
    test.clock.advance(60_000);
    const gym = attribution({ source: 'gym', ref: 'alpha' });
    await track(test, 'landing_view', gym);
    await post(test, '/waitlist', joinBody({ phone: phoneN(2), name: 'Мария', attribution: gym }));

    // 4. Посмотрел и ушёл (Telegram, другой браузер).
    await track(test, 'landing_view', attribution({ source: 'tg', anonId: ANON_B }));

    // 5. Администратор: список и воронка. Вход администратора сам даёт регистрацию «direct».
    const admin = await login(test, PHONE);
    setRole(test.app, PHONE, 'admin');

    const listRes = await get(test, '/admin/waitlist', { cookie: admin });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toEqual({
      items: [
        {
          id: expect.any(Number),
          phone: phoneN(2),
          name: 'Мария',
          gym: null,
          goal: null,
          lang: 'ru',
          source: 'gym',
          ref: 'alpha',
          campaign: null,
          createdAt: '2026-03-10T09:02:00.000Z',
          path: null,
        },
        {
          id: expect.any(Number),
          phone: phoneN(1),
          name: 'Ион',
          gym: 'Alpha Gym',
          goal: 'lose',
          lang: 'ru',
          source: 'tg',
          ref: 'ion',
          campaign: 'nov',
          createdAt: '2026-03-10T09:01:00.000Z',
          path: { usedCalc: true, signedUp: false, purchased: false },
        },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });

    const funnelRes = await get(test, '/admin/funnel', { cookie: admin });
    expect(funnelRes.statusCode).toBe(200);
    const report = funnelRes.json() as {
      from: string;
      to: string;
      rows: Array<{ source: string } & Record<string, unknown>>;
    };
    expect(report.from).toBe('2026-02-09');
    expect(report.to).toBe('2026-03-10');
    const zeros = { landingViews: 0, calcUsed: 0, waitlistJoins: 0, signups: 0, firstPurchases: 0 };
    const noPeople = { visitors: 0, calc: 0, waitlist: 0, signups: 0, purchases: 0 };
    expect(report.rows).toEqual([
      { source: 'gym', ...zeros, landingViews: 1, waitlistJoins: 1, unique: noPeople },
      { source: 'trainer', ...zeros, unique: noPeople },
      {
        source: 'tg',
        ...zeros,
        landingViews: 2,
        calcUsed: 2,
        waitlistJoins: 1,
        unique: { ...noPeople, visitors: 2, calc: 1, waitlist: 1 },
      },
      { source: 'ig', ...zeros, unique: noPeople },
      { source: 'direct', ...zeros, signups: 1, unique: noPeople },
      { source: 'other', ...zeros, unique: noPeople },
      {
        source: 'total',
        ...zeros,
        landingViews: 3,
        calcUsed: 2,
        waitlistJoins: 2,
        signups: 1,
        unique: { ...noPeople, visitors: 2, calc: 1, waitlist: 1 },
      },
    ]);
  });
});
