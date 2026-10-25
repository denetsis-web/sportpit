import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppInstance } from '../src/app.ts';
import { StubPaymentGateway, StubSmsSender } from '../src/modules/adapters/index.ts';
import { createManualClock } from '../src/modules/clock/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureModules = join(here, 'fixtures', 'modules');
const fixtureI18n = join(here, 'fixtures', 'i18n');
const WRITE = { 'x-requested-with': 'sportpit' };

const open: AppInstance[] = [];
const cleanup: Array<() => void> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (cleanup.length) cleanup.pop()!();
});

async function make(options: Parameters<typeof buildApp>[0] = {}): Promise<AppInstance> {
  const app = await buildApp({
    extraModulesDirs: [fixtureModules],
    extraI18nDirs: [fixtureI18n],
    ...options,
  });
  open.push(app);
  return app;
}

describe('каркас сервера', () => {
  it('/api/health отвечает, база в памяти, время берётся из Clock', async () => {
    const clock = createManualClock('2026-05-05T08:00:00Z');
    const app = await make({ clock });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      time: '2026-05-05T08:00:00.000Z',
      db: 'ok',
      events24h: {},
    });
  });

  it('модуль с routes.ts подхватывается сам и работает под /api/v1 с подменёнными зависимостями', async () => {
    const clock = createManualClock('2026-07-14T21:30:00Z');
    const sms = new StubSmsSender({ silent: true });
    const app = await make({ clock, sms });
    const res = await app.inject({ method: 'GET', url: '/api/v1/probe/hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hello: 'мир', smsProvider: 'stub', today: '2026-07-15' });
  });

  it('модуль с jobs.ts регистрирует задачу в планировщике, системная копия на 03:00 тоже', async () => {
    const app = await make();
    const jobs = app.deps.system.scheduler.list();
    expect(jobs).toContainEqual({ name: 'probe-job', cron: '* * * * *' });
    expect(jobs).toContainEqual({ name: 'backup', cron: '0 3 * * *' });
  });

  it('файлы из хранилища отдаются по /api/v1/files/…, чужие ключи и пропажа — JSON-ошибка', async () => {
    const app = await make();
    await app.deps.storage.put('complaints/a1.png', new Uint8Array([1, 2, 3]));
    const ok = await app.inject({ method: 'GET', url: '/api/v1/files/complaints/a1.png' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect([...ok.rawPayload]).toEqual([1, 2, 3]);
    const missing = await app.inject({ method: 'GET', url: '/api/v1/files/complaints/none.png' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    const evil = await app.inject({ method: 'GET', url: '/api/v1/files/..%2F..%2Fsecret' });
    expect(evil.statusCode).toBe(404);
  });

  it('запись требует заголовок X-Requested-With, чтение и вебхуки — нет', async () => {
    const app = await make();
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/probe/echo',
      payload: { a: 1 },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('request_rejected');
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/v1/probe/echo',
      payload: { a: 1 },
      headers: WRITE,
    });
    expect(allowed.json()).toEqual({ got: { a: 1 } });
    const webhook = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/probe',
      payload: {},
    });
    expect(webhook.statusCode).toBe(200);
  });

  it('ошибки приложения приходят JSON-ом на языке запроса, словарь модуля подхвачен без регистрации', async () => {
    const app = await make();
    const ru = await app.inject({ method: 'GET', url: '/api/v1/probe/denied' });
    expect(ru.statusCode).toBe(403);
    expect(ru.json()).toEqual({
      error: { code: 'probe_denied', messageKey: 'probe.denied', message: 'Проба: доступ закрыт' },
    });
    const ro = await app.inject({
      method: 'GET',
      url: '/api/v1/probe/denied',
      headers: { 'accept-language': 'ro-RO,ro;q=0.9' },
    });
    expect(ro.json().error.message).toBe('Probă: acces închis');
  });

  it('403 «Нет доступа» и 429 с числом секунд — на обоих языках', async () => {
    const app = await make();
    const forbidden = await app.inject({ method: 'GET', url: '/api/v1/probe/forbidden' });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.message).toBe('Нет доступа.');
    const roForbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/probe/forbidden',
      headers: { 'accept-language': 'ro' },
    });
    expect(roForbidden.json().error.message).toBe('Acces interzis.');
    const slow = await app.inject({ method: 'GET', url: '/api/v1/probe/slow-down' });
    expect(slow.statusCode).toBe(429);
    expect(slow.json().error.message).toBe('Слишком часто. Подождите 30 сек.');
  });

  it('ошибка проверки данных (zod) даёт 400 со списком полей', async () => {
    const app = await make();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/probe/validate',
      payload: { phone: '123' },
      headers: WRITE,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'validation_failed',
      fields: { phone: 'probe.badPhone' },
    });
  });

  it('неизвестный маршрут API — 404 JSON, неожиданная ошибка — 500 без подробностей и запись в события', async () => {
    const app = await make();
    const nope = await app.inject({ method: 'GET', url: '/api/v1/nothing/here' });
    expect(nope.statusCode).toBe(404);
    expect(nope.json().error.code).toBe('not_found');

    const boom = await app.inject({ method: 'GET', url: '/api/v1/probe/boom' });
    expect(boom.statusCode).toBe(500);
    expect(JSON.stringify(boom.json())).not.toContain('внутренний сбой');
    expect(boom.json().error.code).toBe('internal_error');
    expect(app.deps.system.events.counts24h()).toEqual({ server_error: 1 });
  });

  it('сбой SMS-адаптера попадает в события, считается за 24 часа и виден в /api/health', async () => {
    const sms = new StubSmsSender({ silent: true });
    const app = await make({ sms });
    sms.failNext();
    const failed = await app.inject({ method: 'POST', url: '/api/v1/probe/sms', headers: WRITE });
    expect(failed.statusCode).toBe(500);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/probe/sms', headers: WRITE });
    expect(ok.statusCode).toBe(200);
    expect(sms.outbox).toHaveLength(1);
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json().events24h).toMatchObject({ sms_failed: 1 });
  });

  it('сбой платёжного адаптера пишет payment_failed через deps.payment', async () => {
    const payment = new StubPaymentGateway();
    const app = await make({ payment });
    payment.failNext(new Error('шлюз недоступен'));
    await expect(
      app.deps.payment.createPayment({
        reference: 'r',
        amountBani: 100,
        currency: 'MDL',
        method: 'card',
        returnUrl: 'http://localhost/x',
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow('шлюз недоступен');
    expect(app.deps.system.events.counts24h()).toEqual({ payment_failed: 1 });
  });

  it('каждое приложение получает свою базу в памяти', async () => {
    const a = await make();
    const b = await make();
    a.deps.system.logEvent('only_a');
    expect(a.deps.system.events.list()).toHaveLength(1);
    expect(b.deps.system.events.list()).toHaveLength(0);
  });

  it('повторный запуск на той же файловой базе: миграции не ломаются, данные на месте', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sportpit-app-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'app.db');
    const first = await buildApp({ databasePath: path });
    first.deps.system.logEvent('seen_before', { n: 1 });
    await first.close();
    const second = await buildApp({ databasePath: path });
    open.push(second);
    expect(second.deps.db.migrationsApplied).toEqual([]);
    expect(second.deps.system.events.list().map((e) => e.kind)).toEqual(['seen_before']);
  });

  it('резервная копия по команде и по расписанию использует каталог из конфигурации', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sportpit-bk-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const clock = createManualClock('2026-01-15T00:59:00Z');
    const app = await make({ clock, backupDir: dir });
    clock.set('2026-01-15T01:00:00Z'); // 03:00 по Кишинёву
    await app.deps.system.scheduler.tick();
    const events = app.deps.system.events.list({ kind: 'backup_done' });
    expect(events).toHaveLength(1);
    expect(String(events[0]!.detail.file)).toMatch(/^sportpit-20260115-010000-000\.db$/);
  });

  it('собранный клиент раздаётся самим сервером: оболочка, ресурсы с долгим кэшем, переходы SPA, API не затронут', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sportpit-dist-'));
    cleanup.push(() => rmSync(dist, { recursive: true, force: true }));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>оболочка</title>');
    writeFileSync(join(dist, 'sw.js'), 'self.skipWaiting()');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'export {}');
    const app = await make({ webDistDir: dist, serveWeb: true });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('оболочка');
    expect(index.headers['cache-control']).toBe('no-cache');
    const sw = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(sw.headers['cache-control']).toBe('no-cache');
    const asset = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const route = await app.inject({ method: 'GET', url: '/admin/kitchen' });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('оболочка');
    const api = await app.inject({ method: 'GET', url: '/api/v1/nothing' });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe('not_found');
  });
});
