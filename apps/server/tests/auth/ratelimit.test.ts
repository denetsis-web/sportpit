// Лимиты запросов (F1.4): по IP на выдачу и проверку кода, по пользователю на смену телефона,
// «5 в час» на номер учитывает и неудавшиеся отправки.
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/modules/system/index.ts';
import { login, makeApp, PHONE, WRITE, type TestApp } from './helpers.ts';

const MINUTE = 60_000;

/** Номер вида +37360000NNN: у каждого запроса свой, чтобы лимит «на номер» не мешал лимиту «на IP». */
const phoneN = (n: number) => `+373600${String(n).padStart(5, '0')}`;

const post = (
  test: TestApp,
  url: string,
  payload: unknown,
  extra: { ip?: string; headers?: Record<string, string> } = {},
) =>
  test.app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: { ...WRITE, ...(extra.headers ?? {}) },
    ...(extra.ip ? { remoteAddress: extra.ip } : {}),
  });

describe('лимит по IP на /auth/otp/request', () => {
  it('11-й запрос за окно с одного адреса — 429 «подождите N сек», другой адрес не задет', async () => {
    const test = await makeApp();
    for (let i = 1; i <= 10; i++) {
      const res = await post(test, '/auth/otp/request', { phone: phoneN(i) }, { ip: '10.0.0.1' });
      expect(res.statusCode, `запрос ${i}`).toBe(200);
    }
    const eleventh = await post(
      test,
      '/auth/otp/request',
      { phone: phoneN(11) },
      { ip: '10.0.0.1' },
    );
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.code).toBe('rate_limited');
    expect(eleventh.json().error.message).toMatch(/^Слишком часто\. Подождите \d+ сек\.$/);
    expect(test.sms.outbox).toHaveLength(10); // на 11-й SMS не ушло

    const other = await post(test, '/auth/otp/request', { phone: phoneN(11) }, { ip: '10.0.0.2' });
    expect(other.statusCode).toBe(200);

    // окно прошло — снова можно
    test.clock.advance(11 * MINUTE);
    const later = await post(test, '/auth/otp/request', { phone: phoneN(12) }, { ip: '10.0.0.1' });
    expect(later.statusCode).toBe(200);
  });
});

describe('лимит по IP на /auth/otp/verify', () => {
  it('11-я проверка кода с одного адреса — 429, даже если номера разные', async () => {
    const test = await makeApp();
    for (let i = 1; i <= 10; i++) {
      const res = await post(
        test,
        '/auth/otp/verify',
        { phone: phoneN(i), code: '123456' },
        { ip: '10.0.0.1' },
      );
      expect(res.statusCode, `проверка ${i}`).toBe(400);
    }
    const eleventh = await post(
      test,
      '/auth/otp/verify',
      { phone: phoneN(11), code: '123456' },
      { ip: '10.0.0.1' },
    );
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.message).toContain('Подождите');
    const other = await post(
      test,
      '/auth/otp/verify',
      { phone: phoneN(11), code: '123456' },
      { ip: '10.0.0.2' },
    );
    expect(other.statusCode).toBe(400);
  });
});

describe('TRUST_PROXY', () => {
  const config = (extra: Record<string, string>) =>
    loadConfig({ NODE_ENV: 'test', FILE_STORAGE: 'memory', ...extra });

  async function burst(test: TestApp, forwarded: (i: number) => string): Promise<number[]> {
    const codes: number[] = [];
    for (let i = 1; i <= 11; i++) {
      const res = await post(
        test,
        '/auth/otp/request',
        { phone: phoneN(i) },
        { ip: '10.0.0.9', headers: { 'x-forwarded-for': forwarded(i) } },
      );
      codes.push(res.statusCode);
    }
    return codes;
  }

  it('по умолчанию X-Forwarded-For игнорируется: подмена заголовка лимит не обходит', async () => {
    const test = await makeApp({ config: config({}) });
    const codes = await burst(test, (i) => `203.0.113.${i}`);
    expect(codes.at(-1)).toBe(429);
  });

  it('TRUST_PROXY=true: клиенты за прокси различаются по X-Forwarded-For', async () => {
    const test = await makeApp({ config: config({ TRUST_PROXY: 'true' }) });
    const codes = await burst(test, (i) => `203.0.113.${i}`);
    expect(codes.every((code) => code === 200)).toBe(true);
    const same = await burst(
      await makeApp({ config: config({ TRUST_PROXY: 'true' }) }),
      () => '203.0.113.50',
    );
    expect(same.at(-1)).toBe(429);
  });
});

describe('лимит по пользователю на /profile/phone/request', () => {
  it('11-й запрос кода на новый номер за окно — 429', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    for (let i = 1; i <= 10; i++) {
      const res = await test.app.inject({
        method: 'POST',
        url: '/api/v1/profile/phone/request',
        payload: { phone: phoneN(i) },
        headers: { ...WRITE, cookie },
      });
      expect(res.statusCode, `запрос ${i}`).toBe(200);
    }
    const eleventh = await test.app.inject({
      method: 'POST',
      url: '/api/v1/profile/phone/request',
      payload: { phone: phoneN(11) },
      headers: { ...WRITE, cookie },
    });
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error.message).toContain('Подождите');
  });
});

describe('«5 в час» на номер и сбои SMS', () => {
  it('неудавшиеся отправки занимают квоту: шестая попытка за час — 429, хотя SMS уже исправна', async () => {
    const test = await makeApp();
    for (let i = 0; i < 5; i++) {
      test.sms.failNext();
      const res = await post(test, '/auth/otp/request', { phone: PHONE });
      expect(res.statusCode, `попытка ${i + 1}`).toBe(502);
      test.clock.advance(5 * MINUTE); // другие лимиты (IP, раз в минуту) не мешают
    }
    const sixth = await post(test, '/auth/otp/request', { phone: PHONE });
    expect(sixth.statusCode).toBe(429);
    expect(test.sms.outbox).toHaveLength(0);
  });

  it('сразу после сбоя повторить можно (лимит «раз в минуту» не срабатывает)', async () => {
    const test = await makeApp();
    test.sms.failNext();
    expect((await post(test, '/auth/otp/request', { phone: PHONE })).statusCode).toBe(502);
    expect((await post(test, '/auth/otp/request', { phone: PHONE })).statusCode).toBe(200);
  });
});
