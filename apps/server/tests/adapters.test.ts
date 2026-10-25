import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAdapters,
  instrumentAdapters,
  InvalidCallbackError,
  LocalFileStorage,
  MemoryFileStorage,
  SmsSendError,
  StubPaymentGateway,
  StubSmsSender,
} from '../src/modules/adapters/index.ts';
import { createManualClock } from '../src/modules/clock/index.ts';
import { openDb } from '../src/modules/db/index.ts';
import { createEventLog, loadConfig } from '../src/modules/system/index.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sportpit-ad-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('выбор адаптеров по переменным окружения', () => {
  it('по умолчанию — заглушки оплаты и SMS и локальная папка файлов', () => {
    const a = createAdapters(loadConfig({ UPLOADS_DIR: tempDir() }), { silent: true });
    expect(a.payment).toBeInstanceOf(StubPaymentGateway);
    expect(a.sms).toBeInstanceOf(StubSmsSender);
    expect(a.storage).toBeInstanceOf(LocalFileStorage);
  });

  it('FILE_STORAGE=memory даёт хранилище в памяти', () => {
    const a = createAdapters(loadConfig({ FILE_STORAGE: 'memory' }), { silent: true });
    expect(a.storage).toBeInstanceOf(MemoryFileStorage);
  });

  it('STUB_PAYMENT_OUTCOME задаёт исход платежей заглушки', async () => {
    const a = createAdapters(loadConfig({ STUB_PAYMENT_OUTCOME: 'failed' }), { silent: true });
    const res = await a.payment.createPayment({
      reference: 'p1',
      amountBani: 11900,
      currency: 'MDL',
      method: 'card',
      returnUrl: 'http://localhost/back',
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe('failed');
  });

  it('неподключённый боевой провайдер — понятная ошибка с именем переменной, без значений секретов', () => {
    const cfg = loadConfig({ PAYMENT_PROVIDER: 'maib', PAYMENT_API_KEY: 'СЕКРЕТ-1' });
    expect(() => createAdapters(cfg, { silent: true })).toThrow(/PAYMENT_PROVIDER/);
    try {
      createAdapters(cfg, { silent: true });
    } catch (error) {
      expect((error as Error).message).not.toContain('СЕКРЕТ-1');
    }
    expect(() => createAdapters(loadConfig({ SMS_PROVIDER: 'twilio' }), { silent: true })).toThrow(
      /SMS_PROVIDER/,
    );
    expect(() => createAdapters(loadConfig({ FILE_STORAGE: 's3' }), { silent: true })).toThrow(
      /FILE_STORAGE/,
    );
  });
});

describe('заглушка PaymentGateway', () => {
  const request = {
    reference: 'order-1',
    amountBani: 11900,
    currency: 'MDL' as const,
    method: 'card' as const,
    returnUrl: 'http://localhost/back',
    idempotencyKey: 'key-1',
  };

  it('успех: платёж оплачен, статус можно запросить', async () => {
    const gw = new StubPaymentGateway({ outcome: 'paid' });
    const res = await gw.createPayment(request);
    expect(res.status).toBe('paid');
    expect(res.redirectUrl).toContain(res.providerPaymentId);
    expect((await gw.getPayment(res.providerPaymentId)).status).toBe('paid');
  });

  it('отказ: платёж отклонён с причиной', async () => {
    const gw = new StubPaymentGateway({ outcome: 'failed' });
    const res = await gw.createPayment(request);
    expect(res.status).toBe('failed');
    expect((await gw.getPayment(res.providerPaymentId)).failureReason).toBeTruthy();
  });

  it('ожидание, затем ручное завершение и колбэк, который можно повторить', async () => {
    const gw = new StubPaymentGateway({ outcome: 'pending' });
    const { providerPaymentId } = await gw.createPayment(request);
    expect((await gw.getPayment(providerPaymentId)).status).toBe('pending');

    gw.complete(providerPaymentId, 'paid');
    const callback = gw.callbackFor(providerPaymentId);
    const first = gw.parseCallback(callback);
    const repeat = gw.parseCallback(callback);
    expect(first).toMatchObject({ providerPaymentId, status: 'paid' });
    // повтор приходит с тем же идентификатором события — по нему биллинг отличает повтор
    expect(repeat.eventId).toBe(first.eventId);
  });

  it('тот же ключ идемпотентности — тот же платёж, другой — новая попытка', async () => {
    const gw = new StubPaymentGateway({ outcome: 'pending' });
    const a = await gw.createPayment(request);
    const b = await gw.createPayment(request);
    const c = await gw.createPayment({ ...request, idempotencyKey: 'key-2' });
    expect(b.providerPaymentId).toBe(a.providerPaymentId);
    expect(c.providerPaymentId).not.toBe(a.providerPaymentId);
  });

  it('колбэк с чужой подписью или мусор отклоняются', () => {
    const gw = new StubPaymentGateway();
    expect(() =>
      gw.parseCallback({ body: { providerPaymentId: 'x', status: 'paid' }, headers: {} }),
    ).toThrow(InvalidCallbackError);
    expect(() =>
      gw.parseCallback({ body: 'мусор', headers: { 'x-stub-signature': 'stub' } }),
    ).toThrow(InvalidCallbackError);
  });

  it('возврат записывается; суммы и сбой шлюза управляются из теста', async () => {
    const gw = new StubPaymentGateway({ outcome: 'paid' });
    const { providerPaymentId } = await gw.createPayment(request);
    const refund = await gw.refund({
      providerPaymentId,
      amountBani: 5000,
      reason: 'жалоба',
      idempotencyKey: 'r1',
    });
    expect(refund.status).toBe('done');
    expect(gw.refunds).toHaveLength(1);

    gw.failNext(new Error('шлюз недоступен'));
    await expect(gw.createPayment({ ...request, idempotencyKey: 'k9' })).rejects.toThrow(
      'шлюз недоступен',
    );
    await expect(gw.createPayment({ ...request, idempotencyKey: 'k10' })).resolves.toBeDefined();
  });

  it('сумма должна быть целым положительным числом бань', async () => {
    const gw = new StubPaymentGateway();
    await expect(gw.createPayment({ ...request, amountBani: 99.5 })).rejects.toThrow(RangeError);
    await expect(gw.createPayment({ ...request, amountBani: 0 })).rejects.toThrow(RangeError);
  });
});

describe('заглушка SmsSender', () => {
  it('складывает отправленные сообщения в outbox, чтобы тест мог прочитать код', async () => {
    const sms = new StubSmsSender({ silent: true });
    await sms.send({ to: '+37360000001', text: 'Код 123456' });
    await sms.send({ to: '+37360000002', text: 'Код 654321' });
    expect(sms.last('+37360000001')?.text).toBe('Код 123456');
    expect(sms.outbox).toHaveLength(2);
  });

  it('failNext имитирует сбой провайдера', async () => {
    const sms = new StubSmsSender({ silent: true });
    sms.failNext();
    await expect(sms.send({ to: '+37360000001', text: 'x' })).rejects.toBeInstanceOf(SmsSendError);
    await expect(sms.send({ to: '+37360000001', text: 'x' })).resolves.toBeUndefined();
    expect(sms.outbox).toHaveLength(1);
  });
});

describe('сбои адаптеров попадают в журнал событий и считаются за 24 часа', () => {
  function setup() {
    const clock = createManualClock('2026-02-10T12:00:00Z');
    const db = openDb(':memory:');
    cleanup.push(() => db.close());
    const events = createEventLog(db, clock);
    const stubSms = new StubSmsSender({ silent: true });
    const stubPay = new StubPaymentGateway();
    const { sms, payment } = instrumentAdapters({ sms: stubSms, payment: stubPay }, events);
    return { events, stubSms, stubPay, sms, payment };
  }

  it('сбой SMS пишет sms_failed, не раскрывая номер целиком, и пробрасывает ошибку', async () => {
    const { events, stubSms, sms } = setup();
    stubSms.failNext(new SmsSendError('провайдер ответил 500'));
    await expect(sms.send({ to: '+37360123456', text: 'Код 111111' })).rejects.toBeInstanceOf(
      SmsSendError,
    );
    const [event] = events.list({ kind: 'sms_failed' });
    expect(event!.detail).toMatchObject({ message: 'провайдер ответил 500' });
    const text = JSON.stringify(event);
    expect(text).not.toContain('+37360123456');
    expect(text).not.toContain('111111');
    expect(events.counts24h()).toEqual({ sms_failed: 1 });
  });

  it('сбой оплаты пишет payment_failed; успешные вызовы события не создают', async () => {
    const { events, stubPay, payment } = setup();
    const ok = await payment.createPayment({
      reference: 'o1',
      amountBani: 9900,
      currency: 'MDL',
      method: 'mia',
      returnUrl: 'http://localhost/b',
      idempotencyKey: 'a',
    });
    expect(ok.providerPaymentId).toBeTruthy();
    expect(events.counts24h()).toEqual({});

    stubPay.failNext(new Error('таймаут шлюза'));
    await expect(
      payment.createPayment({
        reference: 'o2',
        amountBani: 9900,
        currency: 'MDL',
        method: 'card',
        returnUrl: 'http://localhost/b',
        idempotencyKey: 'b',
      }),
    ).rejects.toThrow('таймаут шлюза');
    expect(events.counts24h()).toEqual({ payment_failed: 1 });
    expect(events.list({ kind: 'payment_failed' })[0]!.detail).toMatchObject({
      operation: 'createPayment',
    });
  });

  it('отклонённая картой оплата — не сбой системы и в журнал не пишется', async () => {
    const { events, stubPay, payment } = setup();
    stubPay.setOutcome('failed');
    const res = await payment.createPayment({
      reference: 'o3',
      amountBani: 9900,
      currency: 'MDL',
      method: 'card',
      returnUrl: 'http://localhost/b',
      idempotencyKey: 'c',
    });
    expect(res.status).toBe('failed');
    expect(events.counts24h()).toEqual({});
  });
});

describe('FileStorage', () => {
  const png = new Uint8Array([137, 80, 78, 71]);

  it('локальное хранилище: put, get, delete; файл лежит в папке uploads', async () => {
    const root = tempDir();
    const storage = new LocalFileStorage({ rootDir: root });
    const stored = await storage.put('complaints/abc123.png', png);
    expect(stored).toMatchObject({ key: 'complaints/abc123.png', size: 4 });
    expect(stored.url).toBe('/api/v1/files/complaints/abc123.png');
    expect(existsSync(join(root, 'complaints', 'abc123.png'))).toBe(true);
    const got = await storage.get('complaints/abc123.png');
    expect(got?.contentType).toBe('image/png');
    expect([...got!.data]).toEqual([...png]);
    expect(await storage.delete('complaints/abc123.png')).toBe(true);
    expect(await storage.get('complaints/abc123.png')).toBeUndefined();
    expect(await storage.delete('complaints/abc123.png')).toBe(false);
  });

  it('ключи с выходом из папки отвергаются', async () => {
    const storage = new LocalFileStorage({ rootDir: tempDir() });
    for (const key of ['../evil.png', '/abs.png', 'a/../../b.png', 'a\\b.png', '', 'C:/x.png']) {
      await expect(storage.put(key, png), key).rejects.toThrow(RangeError);
      await expect(storage.get(key), key).rejects.toThrow(RangeError);
    }
  });

  it('хранилище в памяти ведёт себя так же', async () => {
    const storage = new MemoryFileStorage();
    await storage.put('a/b.jpg', png);
    expect((await storage.get('a/b.jpg'))?.contentType).toBe('image/jpeg');
    expect(await storage.delete('a/b.jpg')).toBe(true);
    expect(await storage.get('a/b.jpg')).toBeUndefined();
  });
});
