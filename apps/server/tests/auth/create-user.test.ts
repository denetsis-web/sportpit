import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCreateUser } from '../../src/modules/auth/cli.ts';
import { createManualClock } from '../../src/modules/clock/index.ts';
import { openDb, type Db } from '../../src/modules/db/index.ts';
import { PHONE } from './helpers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SECRET = 'secret-value-that-must-never-be-printed';

const dbs: Db[] = [];
const dirs: string[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function run(argv: string[]) {
  const db = openDb(':memory:');
  dbs.push(db);
  const out: string[] = [];
  const err: string[] = [];
  const code = runCreateUser(argv, {
    db,
    clock: createManualClock('2026-03-10T09:00:00Z'),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { db, code, out: out.join('\n'), err: err.join('\n') };
}

const users = (db: Db) =>
  db.query<{ phone: string; role: string; created_at: string }>(
    'SELECT phone, role, created_at FROM users',
  );

describe('npm run create-user: создание пользователя', () => {
  it('создаёт администратора с указанным номером', () => {
    const { db, code, out } = run(['--phone', PHONE, '--role', 'admin']);
    expect(code).toBe(0);
    expect(users(db)).toEqual([
      { phone: PHONE, role: 'admin', created_at: '2026-03-10T09:00:00.000Z' },
    ]);
    expect(out).toContain(PHONE);
    expect(out).toContain('admin');
  });

  it('роль по умолчанию — клиент; поддерживаются все четыре роли', () => {
    expect(users(run(['--phone', PHONE]).db)[0]!.role).toBe('client');
    for (const role of ['client', 'kitchen', 'operator', 'admin']) {
      expect(users(run(['--phone', PHONE, '--role', role]).db)[0]!.role).toBe(role);
    }
  });

  it.each([
    [['--phone', '+37360', '--role', 'admin'], 'Укажите номер'],
    [['--role', 'admin'], 'Укажите номер'],
    [['--phone', PHONE, '--role', 'boss'], 'Роль должна быть одной из'],
  ])('неверные аргументы %j: код выхода 1, понятное сообщение, база не тронута', (argv, text) => {
    const { db, code, err } = run(argv);
    expect(code).toBe(1);
    expect(err).toContain(text);
    expect(users(db)).toEqual([]);
  });

  it('повторный запуск для того же номера меняет роль, а не создаёт второго пользователя', () => {
    const db = openDb(':memory:');
    dbs.push(db);
    const ctx = { db, clock: createManualClock(), out: () => undefined, err: () => undefined };
    runCreateUser(['--phone', PHONE, '--role', 'client'], ctx);
    expect(runCreateUser(['--phone', PHONE, '--role', 'admin'], ctx)).toBe(0);
    expect(users(db).map((u) => u.role)).toEqual(['admin']);
  });
});

describe('скрипт scripts/create-user.ts целиком', () => {
  it('создаёт пользователя в файле базы и не выводит секретов из окружения', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sportpit-cu-'));
    dirs.push(dir);
    const databasePath = join(dir, 'data', 'test.db');
    const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const result = spawnSync(
      process.execPath,
      [tsx, join(root, 'scripts', 'create-user.ts'), '--phone', PHONE, '--role', 'admin'],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_PATH: databasePath,
          SESSION_SECRET: SECRET,
          SMS_API_KEY: SECRET,
          PAYMENT_API_KEY: SECRET,
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(SECRET);
    expect(result.stdout).toContain(PHONE);

    const db = openDb(databasePath);
    dbs.push(db);
    expect(users(db).map((u) => [u.phone, u.role])).toEqual([[PHONE, 'admin']]);
  });

  it('неверная роль: ненулевой код выхода', () => {
    const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const failed = spawnSync(
      process.execPath,
      [tsx, join(root, 'scripts', 'create-user.ts'), '--phone', PHONE, '--role', 'boss'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(failed.status).toBe(1);
  });
});
