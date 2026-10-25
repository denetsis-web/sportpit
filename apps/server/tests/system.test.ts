import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createManualClock } from '../src/modules/clock/index.ts';
import { openDb } from '../src/modules/db/index.ts';
import {
  createBackup,
  createEventLog,
  createScheduler,
  loadConfig,
  matchesCron,
  redactedConfig,
} from '../src/modules/system/index.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sportpit-sys-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('конфигурация из окружения', () => {
  it('без переменных работают безопасные значения по умолчанию: заглушки и локальные папки', () => {
    const c = loadConfig({});
    expect(c.port).toBe(3000);
    expect(c.payment.provider).toBe('stub');
    expect(c.sms.provider).toBe('stub');
    expect(c.storage.provider).toBe('local');
    expect(c.backup.keep).toBe(14);
    expect(c.databasePath).toMatch(/data[\\/]sportpit\.db$/);
  });

  it('пустое значение из .env.example считается незаданным', () => {
    const c = loadConfig({ PAYMENT_PROVIDER: '', PORT: '', SMS_API_KEY: '' });
    expect(c.payment.provider).toBe('stub');
    expect(c.port).toBe(3000);
    expect(c.sms.apiKey).toBeUndefined();
  });

  it('читает порт, провайдеров и ключи; неверный порт — ошибка', () => {
    const c = loadConfig({ PORT: '4100', PAYMENT_PROVIDER: 'maib', SMS_API_KEY: 'k' });
    expect(c.port).toBe(4100);
    expect(c.payment.provider).toBe('maib');
    expect(c.sms.apiKey).toBe('k');
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('безопасное описание для журнала не содержит значений секретов', () => {
    const c = loadConfig({
      SMS_API_KEY: 'СЕКРЕТ-ключ-смс',
      PAYMENT_API_KEY: 'СЕКРЕТ-ключ-оплаты',
      PAYMENT_WEBHOOK_SECRET: 'СЕКРЕТ-вебхук',
      SESSION_SECRET: 'СЕКРЕТ-сессия',
    });
    const text = JSON.stringify(redactedConfig(c));
    expect(text).not.toContain('СЕКРЕТ');
    expect(redactedConfig(c).sms).toMatchObject({ provider: 'stub', hasApiKey: true });
  });
});

describe('журнал событий системы', () => {
  function setup() {
    const clock = createManualClock('2026-02-10T12:00:00Z');
    const db = openDb(':memory:');
    cleanup.push(() => db.close());
    return { clock, db, log: createEventLog(db, clock) };
  }

  it('logEvent пишет событие с видом, деталями и временем UTC', () => {
    const { log } = setup();
    log.log('sms_failed', { phone: '+37360000000', reason: 'timeout' });
    const [event] = log.list();
    expect(event).toMatchObject({
      kind: 'sms_failed',
      createdAt: '2026-02-10T12:00:00.000Z',
      detail: { phone: '+37360000000', reason: 'timeout' },
    });
  });

  it('счётчики за 24 часа: старые события не считаются, виды считаются отдельно', () => {
    const { log, clock } = setup();
    clock.set('2026-02-09T10:00:00Z'); // 26 часов назад
    log.log('sms_failed');
    clock.set('2026-02-09T13:00:00Z'); // 23 часа назад
    log.log('sms_failed');
    clock.set('2026-02-10T11:00:00Z');
    log.log('sms_failed');
    log.log('payment_failed');
    clock.set('2026-02-10T12:00:00Z');
    expect(log.counts24h()).toEqual({ sms_failed: 2, payment_failed: 1 });
  });

  it('значения под ключами секретов не попадают в журнал', () => {
    const { log } = setup();
    log.log('payment_failed', {
      apiKey: 'не-должен-попасть',
      headers: { Authorization: 'Bearer не-должен-попасть', ok: 'видно' },
    });
    const text = JSON.stringify(log.list());
    expect(text).not.toContain('не-должен-попасть');
    expect(text).toContain('видно');
  });

  it('подписчик получает новое событие; сбой подписчика не ломает запись', () => {
    const { log } = setup();
    const seen: string[] = [];
    log.subscribe(() => {
      throw new Error('упал подписчик');
    });
    log.subscribe((e) => seen.push(e.kind));
    log.log('server_error');
    expect(seen).toEqual(['server_error']);
    expect(log.list()).toHaveLength(1);
  });

  it('список фильтруется по виду и постранично, новые первыми', () => {
    const { log, clock } = setup();
    for (let i = 0; i < 5; i++) {
      clock.advance(1000);
      log.log(i % 2 ? 'a' : 'b', { i });
    }
    expect(log.list({ kind: 'a' }).map((e) => e.detail.i)).toEqual([3, 1]);
    expect(log.list({ limit: 2, offset: 1 }).map((e) => e.detail.i)).toEqual([3, 2]);
  });
});

describe('cron по Кишинёву', () => {
  it('поддерживает числа, списки, диапазоны и шаги', () => {
    const at = (iso: string) => new Date(iso);
    // 03:00 по Кишинёву зимой = 01:00 UTC
    expect(matchesCron('0 3 * * *', at('2026-01-15T01:00:00Z'))).toBe(true);
    expect(matchesCron('0 3 * * *', at('2026-01-15T03:00:00Z'))).toBe(false);
    // летом то же 03:00 по Кишинёву = 00:00 UTC
    expect(matchesCron('0 3 * * *', at('2026-07-15T00:00:00Z'))).toBe(true);
    expect(matchesCron('*/15 * * * *', at('2026-01-15T10:45:00Z'))).toBe(true);
    expect(matchesCron('*/15 * * * *', at('2026-01-15T10:50:00Z'))).toBe(false);
    // 15 января 2026 — четверг (4); 18 января — воскресенье
    expect(matchesCron('30 12 * * 1-5', at('2026-01-15T10:30:00Z'))).toBe(true);
    expect(matchesCron('30 12 * * 1-5', at('2026-01-18T10:30:00Z'))).toBe(false);
    expect(matchesCron('0 1,2 * * 0', at('2026-01-18T00:00:00Z'))).toBe(true);
  });

  it('неверное выражение — ошибка', () => {
    expect(() => matchesCron('0 3 * *', new Date())).toThrow(/cron/);
    expect(() => matchesCron('61 3 * * *', new Date())).toThrow(/cron/);
    expect(() => matchesCron('a b c d e', new Date())).toThrow(/cron/);
  });
});

describe('планировщик', () => {
  function setup(start = '2026-01-15T00:59:00Z') {
    const clock = createManualClock(start);
    const db = openDb(':memory:');
    cleanup.push(() => db.close());
    const events = createEventLog(db, clock);
    const scheduler = createScheduler({ clock, events });
    return { clock, events, scheduler };
  }

  it('запускает задачу в свою минуту, и только один раз за минуту', async () => {
    const { scheduler, clock } = setup();
    let runs = 0;
    scheduler.register('nightly', '0 3 * * *', () => {
      runs += 1;
    });
    await scheduler.tick(); // 02:59 по Кишинёву
    expect(runs).toBe(0);
    clock.set('2026-01-15T01:00:10Z');
    await scheduler.tick();
    await scheduler.tick();
    expect(runs).toBe(1);
    clock.set('2026-01-16T01:00:00Z');
    await scheduler.tick();
    expect(runs).toBe(2);
  });

  it('упавшая задача пишет job_failed и не мешает остальным', async () => {
    const { scheduler, events } = setup('2026-01-15T01:00:00Z');
    let ok = 0;
    scheduler.register('bad', '0 3 * * *', async () => {
      throw new Error('сломалась');
    });
    scheduler.register('good', '0 3 * * *', () => {
      ok += 1;
    });
    await scheduler.tick();
    expect(ok).toBe(1);
    expect(events.list({ kind: 'job_failed' })[0]!.detail).toMatchObject({
      job: 'bad',
      message: 'сломалась',
    });
  });

  it('повторная регистрация имени и список задач', () => {
    const { scheduler } = setup();
    scheduler.register('a', '* * * * *', () => {});
    expect(() => scheduler.register('a', '* * * * *', () => {})).toThrow(/a/);
    expect(scheduler.list()).toEqual([{ name: 'a', cron: '* * * * *' }]);
  });

  it('start и stop не оставляют таймеров', () => {
    const { scheduler } = setup();
    scheduler.start();
    expect(scheduler.running).toBe(true);
    scheduler.stop();
    expect(scheduler.running).toBe(false);
  });
});

describe('резервная копия базы', () => {
  it('создаёт рабочую копию с данными по команде', () => {
    const dir = tempDir();
    const clock = createManualClock('2026-03-01T03:00:00Z');
    const db = openDb(':memory:');
    cleanup.push(() => db.close());
    db.exec('CREATE TABLE note (text TEXT)');
    db.run('INSERT INTO note VALUES (?)', ['не потерять']);

    const result = createBackup(db, { dir, clock, keep: 14 });
    expect(result.path.startsWith(dir)).toBe(true);
    expect(existsSync(result.path)).toBe(true);
    const copy = new DatabaseSync(result.path);
    expect(copy.prepare('SELECT text FROM note').get()).toMatchObject({ text: 'не потерять' });
    copy.close();
  });

  it('хранит 14 последних копий, старые удаляет, чужие файлы не трогает', () => {
    const dir = join(tempDir(), 'backups');
    mkdirSync(dir);
    writeFileSync(join(dir, 'notes.txt'), 'чужой файл');
    const clock = createManualClock('2026-03-01T03:00:00Z');
    const db = openDb(':memory:');
    cleanup.push(() => db.close());
    const created: string[] = [];
    for (let day = 0; day < 20; day++) {
      created.push(createBackup(db, { dir, clock, keep: 14 }).path);
      clock.advance(24 * 60 * 60 * 1000);
    }
    const left = readdirSync(dir).filter((f) => f.endsWith('.db'));
    expect(left).toHaveLength(14);
    expect(left.sort()).toEqual(
      created
        .slice(6)
        .map((p) => p.split(/[\\/]/).pop()!)
        .sort(),
    );
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
  });
});
