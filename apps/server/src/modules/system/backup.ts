// Резервная копия базы: файл SQLite через VACUUM INTO, хранится последние N копий (по умолчанию 14).
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';

export interface BackupOptions {
  dir: string;
  clock: Clock;
  keep?: number;
}

export interface BackupResult {
  path: string;
  removed: string[];
}

const BACKUP_FILE = /^sportpit-\d{8}-\d{6}-\d{3}\.db$/;

function stamp(at: Date): string {
  const iso = at.toISOString(); // 2026-03-01T03:00:00.000Z
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}-${iso.slice(20, 23)}`;
}

export function createBackup(db: Db, { dir, clock, keep = 14 }: BackupOptions): BackupResult {
  if (!Number.isInteger(keep) || keep < 1)
    throw new RangeError('keep должен быть целым числом от 1');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `sportpit-${stamp(clock.now())}.db`);
  if (existsSync(path)) throw new Error(`Копия уже существует: ${path}`);
  db.run('VACUUM INTO ?', [path]);

  // Имена содержат время, поэтому сортировка по имени = сортировка по возрасту.
  const copies = readdirSync(dir)
    .filter((name) => BACKUP_FILE.test(name))
    .sort();
  const removed = copies.slice(0, Math.max(0, copies.length - keep));
  for (const name of removed) rmSync(join(dir, name), { force: true });
  return { path, removed };
}
