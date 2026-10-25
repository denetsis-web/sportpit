// Подключение SQLite (встроенный node:sqlite), миграции и транзакции.
// Драйвер спрятан здесь: остальной код видит только интерфейс `Db`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export type SqlValue = string | number | bigint | null | Uint8Array;
/** Позиционные параметры (`?`) массивом или именованные (`:name`) объектом. */
export type SqlParams = readonly SqlValue[] | Record<string, SqlValue>;

export interface Db {
  /** Миграции, применённые при этом открытии (пусто, если база уже актуальна). */
  readonly migrationsApplied: string[];
  query<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[];
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined;
  run(sql: string, params?: SqlParams): { changes: number; lastInsertRowid: number | bigint };
  /** Несколько операторов без параметров (создание таблиц и т. п.). */
  exec(sql: string): void;
  /**
   * Атомарная транзакция. Функция синхронная: транзакция не должна жить через await.
   * Исключение откатывает всё и пробрасывается; вложенный `tx` откатывает только свою часть.
   */
  tx<T>(fn: (db: Db) => T): T;
  close(): void;
}

export interface OpenDbOptions {
  /** Папка с миграциями NNN-name.sql. По умолчанию apps/server/migrations. */
  migrationsDir?: string;
}

export const DEFAULT_MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations',
);

const MIGRATION_NAME = /^(\d{3})-[a-z0-9][a-z0-9-]*\.sql$/;

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

function readMigrations(dir: string): MigrationFile[] {
  if (!existsSync(dir)) throw new Error(`Папка миграций не найдена: ${dir}`);
  const names = readdirSync(dir).filter((n) => !n.startsWith('.') && !n.endsWith('.md'));
  const seen = new Map<string, string>();
  for (const name of names) {
    const match = MIGRATION_NAME.exec(name);
    if (!match) throw new Error(`Миграция ${name}: имя должно быть вида NNN-name.sql`);
    const number = match[1]!;
    const other = seen.get(number);
    if (other) throw new Error(`Номер миграции ${number} занят дважды: ${other} и ${name}`);
    seen.set(number, name);
  }
  return names.sort().map((name) => {
    // Окончания строк нормализуются: git на Windows может переписать их, это не правка миграции.
    const sql = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

function toRow<T>(row: unknown): T {
  // node:sqlite отдаёт объекты без прототипа; приводим к обычным.
  return Object.assign({}, row) as T;
}

function bind(params: SqlParams | undefined): unknown[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? [...params] : [params];
}

export function openDb(path: string, options: OpenDbOptions = {}): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');

  let depth = 0;
  const applied: string[] = [];

  const db: Db = {
    migrationsApplied: applied,
    query: <T>(sql: string, params?: SqlParams) =>
      (raw.prepare(sql).all(...(bind(params) as never[])) as unknown[]).map((r) => toRow<T>(r)),
    get: <T>(sql: string, params?: SqlParams) => {
      const row = raw.prepare(sql).get(...(bind(params) as never[]));
      return row === undefined ? undefined : toRow<T>(row);
    },
    run: (sql, params) => {
      const info = raw.prepare(sql).run(...(bind(params) as never[]));
      return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid };
    },
    exec: (sql) => raw.exec(sql),
    tx<T>(fn: (db: Db) => T): T {
      const savepoint = `sp_${depth}`;
      raw.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
      depth += 1;
      try {
        const result = fn(db);
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          throw new Error('Функция транзакции должна быть синхронной (без async/await).');
        }
        depth -= 1;
        raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
        return result;
      } catch (error) {
        depth -= 1;
        if (depth === 0) raw.exec('ROLLBACK');
        else raw.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw error;
      }
    },
    close: () => {
      if (raw.isOpen) raw.close();
    },
  };

  try {
    applied.push(...migrate(db, options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR));
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

/** Применяет ещё не применённые миграции по порядку; возвращает их имена. */
export function migrate(db: Db, dir: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const done = new Map(
    db
      .query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')
      .map((r) => [r.name, r.checksum]),
  );
  const applied: string[] = [];
  for (const file of readMigrations(dir)) {
    const known = done.get(file.name);
    if (known !== undefined) {
      if (known !== file.checksum) {
        throw new Error(
          `Миграция ${file.name} изменена после применения. Существующие миграции не правятся: добавьте новую.`,
        );
      }
      continue;
    }
    try {
      db.tx((tx) => {
        tx.exec(file.sql);
        tx.run('INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)', [
          file.name,
          file.checksum,
          new Date().toISOString(),
        ]);
      });
    } catch (error) {
      throw new Error(`Миграция ${file.name} не применилась: ${(error as Error).message}`, {
        cause: error,
      });
    }
    applied.push(file.name);
  }
  return applied;
}
