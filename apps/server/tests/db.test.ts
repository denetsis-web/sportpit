import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/modules/db/index.ts';

const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sportpit-db-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function migrationsDir(files: Record<string, string>): string {
  const dir = join(tempDir(), 'migrations');
  mkdirSync(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

function open(path: string, dir?: string): Db {
  const db = openDb(path, dir ? { migrationsDir: dir } : {});
  cleanup.push(() => db.close());
  return db;
}

describe('миграции при старте', () => {
  it('настоящие миграции проекта применяются к пустой базе в памяти', () => {
    const db = open(':memory:');
    const applied = db.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    expect(applied.map((r) => r.name)).toContain('001-system-events.sql');
    expect(db.query('SELECT * FROM system_events')).toEqual([]);
  });

  it('повторный запуск на той же файловой базе ничего не ломает и не применяет заново', () => {
    const path = join(tempDir(), 'app.db');
    const dir = migrationsDir({ '001-a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY, v TEXT);' });
    const first = open(path, dir);
    expect(first.migrationsApplied).toEqual(['001-a.sql']);
    first.run('INSERT INTO a (v) VALUES (?)', ['сохранится']);
    first.close();

    const second = open(path, dir);
    expect(second.migrationsApplied).toEqual([]);
    expect(second.query('SELECT v FROM a')).toEqual([{ v: 'сохранится' }]);
  });

  it('новые миграции дописываются по порядку номеров', () => {
    const path = join(tempDir(), 'app.db');
    const dir = migrationsDir({
      '002-b.sql': 'CREATE TABLE b (id INTEGER);',
      '001-a.sql': 'CREATE TABLE a (id INTEGER);',
    });
    expect(open(path, dir).migrationsApplied).toEqual(['001-a.sql', '002-b.sql']);
    writeFileSync(join(dir, '010-c.sql'), 'CREATE TABLE c (id INTEGER);');
    expect(open(path, dir).migrationsApplied).toEqual(['010-c.sql']);
  });

  it('изменённую после применения миграцию не принимает', () => {
    const path = join(tempDir(), 'app.db');
    const dir = migrationsDir({ '001-a.sql': 'CREATE TABLE a (id INTEGER);' });
    open(path, dir).close();
    writeFileSync(join(dir, '001-a.sql'), 'CREATE TABLE a (id INTEGER, extra TEXT);');
    expect(() => openDb(path, { migrationsDir: dir })).toThrow(/001-a\.sql.*изменена/);
  });

  it('окончания строк не считаются изменением файла (Windows и git)', () => {
    const path = join(tempDir(), 'app.db');
    const dir = migrationsDir({ '001-a.sql': 'CREATE TABLE a (id INTEGER);\nSELECT 1;\n' });
    open(path, dir).close();
    writeFileSync(join(dir, '001-a.sql'), 'CREATE TABLE a (id INTEGER);\r\nSELECT 1;\r\n');
    expect(open(path, dir).migrationsApplied).toEqual([]);
  });

  it('упавшая миграция откатывается целиком и не записывается как применённая', () => {
    const path = join(tempDir(), 'app.db');
    const dir = migrationsDir({
      '001-a.sql': 'CREATE TABLE a (id INTEGER);',
      '002-bad.sql': 'CREATE TABLE half (id INTEGER); INSERT INTO нет_такой_таблицы VALUES (1);',
    });
    expect(() => openDb(path, { migrationsDir: dir })).toThrow(/002-bad\.sql/);
    writeFileSync(join(dir, '002-bad.sql'), 'CREATE TABLE half (id INTEGER);');
    const db = open(path, dir);
    expect(db.migrationsApplied).toEqual(['002-bad.sql']);
  });

  it('файл с неверным именем или повторным номером — ошибка', () => {
    expect(() =>
      openDb(':memory:', { migrationsDir: migrationsDir({ 'create.sql': '' }) }),
    ).toThrow(/create\.sql/);
    expect(() =>
      openDb(':memory:', {
        migrationsDir: migrationsDir({ '001-a.sql': '', '001-b.sql': '' }),
      }),
    ).toThrow(/001/);
  });
});

describe('транзакции и запросы', () => {
  function fresh(): Db {
    const db = open(':memory:', migrationsDir({ '001-t.sql': 'CREATE TABLE t (n INTEGER);' }));
    return db;
  }
  const count = (db: Db) => db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t')!.c;

  it('tx фиксирует изменения и возвращает результат функции', () => {
    const db = fresh();
    const out = db.tx((tx) => {
      tx.run('INSERT INTO t VALUES (?)', [1]);
      tx.run('INSERT INTO t VALUES (:n)', { n: 2 });
      return 'готово';
    });
    expect(out).toBe('готово');
    expect(count(db)).toBe(2);
  });

  it('tx откатывает всё при исключении и пробрасывает его', () => {
    const db = fresh();
    expect(() =>
      db.tx((tx) => {
        tx.run('INSERT INTO t VALUES (1)');
        throw new Error('сбой');
      }),
    ).toThrow('сбой');
    expect(count(db)).toBe(0);
  });

  it('вложенный tx откатывает только внутреннюю часть', () => {
    const db = fresh();
    db.tx((outer) => {
      outer.run('INSERT INTO t VALUES (1)');
      expect(() =>
        outer.tx((inner) => {
          inner.run('INSERT INTO t VALUES (2)');
          throw new Error('внутренний сбой');
        }),
      ).toThrow('внутренний сбой');
      outer.run('INSERT INTO t VALUES (3)');
    });
    expect(db.query<{ n: number }>('SELECT n FROM t ORDER BY n').map((r) => r.n)).toEqual([1, 3]);
  });

  it('асинхронная функция в tx запрещена: транзакция не должна жить через await', () => {
    const db = fresh();
    expect(() => db.tx((async () => 1) as unknown as () => number)).toThrow(/синхрон/);
    expect(count(db)).toBe(0);
  });

  it('внешние ключи включены', () => {
    const db = open(
      ':memory:',
      migrationsDir({
        '001-fk.sql':
          'CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (pid INTEGER REFERENCES p(id));',
      }),
    );
    expect(() => db.run('INSERT INTO c VALUES (99)')).toThrow(/FOREIGN KEY/);
  });

  it('отказ COMMIT (отложенный внешний ключ): откат, исходная ошибка и рабочие следующие транзакции', () => {
    const db = open(
      ':memory:',
      migrationsDir({
        '001-fk.sql':
          'CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (pid INTEGER REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED);',
      }),
    );
    expect(() => db.tx((tx) => tx.run('INSERT INTO c VALUES (99)'))).toThrow(/FOREIGN KEY/);
    // транзакция не осталась открытой, а счётчик вложенности не сбился
    db.tx((tx) => {
      tx.run('INSERT INTO p VALUES (1)');
      tx.run('INSERT INTO c VALUES (1)');
    });
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM c')!.n).toBe(1);
    expect(() => db.tx((tx) => tx.run('INSERT INTO c VALUES (98)'))).toThrow(/FOREIGN KEY/);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM c')!.n).toBe(1);
  });

  it('run сообщает число изменённых строк, get возвращает undefined, если строки нет', () => {
    const db = fresh();
    expect(db.run('INSERT INTO t VALUES (5)').changes).toBe(1);
    expect(db.get('SELECT n FROM t WHERE n = 404')).toBeUndefined();
  });
});
