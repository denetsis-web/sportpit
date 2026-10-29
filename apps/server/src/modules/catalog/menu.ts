// Меню на дни: сбор, публикация, копирование (ротация). Клиент видит только опубликованные дни.
import type { AdminMenuDayDto, MenuDaySummary, MenuEntry } from '@sportpit/shared/schemas/catalog';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { writeAudit } from '../admin/audit.ts';
import { AppError, errors } from '../system/errors.ts';

export type ReservedProvider = (date: string, dishId: number) => number;

interface DayRow {
  date: string;
  published: number;
  published_at: string | null;
}

interface ItemRow {
  dish_id: number;
  portion_limit: number;
}

export function getDay(db: Db, date: string): DayRow | undefined {
  return db.get<DayRow>('SELECT date, published, published_at FROM menu_days WHERE date = ?', [
    date,
  ]);
}

export function listItems(db: Db, date: string): ItemRow[] {
  return db.query<ItemRow>(
    'SELECT dish_id, portion_limit FROM menu_items WHERE date = ? ORDER BY position, dish_id',
    [date],
  );
}

export function adminDay(db: Db, date: string, reserved: ReservedProvider): AdminMenuDayDto {
  const day = getDay(db, date);
  return {
    date,
    published: day?.published === 1,
    publishedAt: day?.published_at ?? null,
    items: listItems(db, date).map((row) => ({
      dishId: row.dish_id,
      portionLimit: row.portion_limit,
      reserved: reserved(date, row.dish_id),
    })),
  };
}

export function listDays(db: Db, from: string, to: string): MenuDaySummary[] {
  return db
    .query<{ date: string; published: number; n: number }>(
      `SELECT d.date, d.published, (SELECT COUNT(*) FROM menu_items i WHERE i.date = d.date) AS n
       FROM menu_days d WHERE d.date >= ? AND d.date <= ? ORDER BY d.date`,
      [from, to],
    )
    .map((row) => ({ date: row.date, published: row.published === 1, itemCount: row.n }));
}

const menuPast = () => new AppError(400, 'menu_past', 'catalog.error.menuPast');
const invalid = (field: string, key: string) =>
  new AppError(400, 'validation_failed', 'core.error.validation', { fields: { [field]: key } });

function assertNotPast(clock: Clock, date: string): void {
  if (date < clock.localDate()) throw menuPast();
}

/** Сохраняет состав меню дня (черновик или уже опубликованного). */
export function saveDay(
  db: Db,
  clock: Clock,
  date: string,
  entries: MenuEntry[],
  reserved: ReservedProvider,
  actorId: number | null,
): AdminMenuDayDto {
  assertNotPast(clock, date);
  const seen = new Set<number>();
  for (const entry of entries) {
    if (seen.has(entry.dishId)) throw invalid('items', 'catalog.error.menuDuplicate');
    seen.add(entry.dishId);
  }
  return db.tx((tx) => {
    for (const entry of entries) {
      const dish = tx.get<{ active: number }>('SELECT active FROM dishes WHERE id = ?', [
        entry.dishId,
      ]);
      if (!dish || dish.active !== 1) throw invalid('items', 'catalog.error.menuDish');
    }
    // уже занятые порции нельзя «отобрать»: ни убрав блюдо, ни опустив лимит ниже занятого
    for (const current of listItems(tx, date)) {
      const taken = reserved(date, current.dish_id);
      if (taken === 0) continue;
      const next = entries.find((e) => e.dishId === current.dish_id);
      if (!next || next.portionLimit < taken) {
        throw new AppError(409, 'portions_reserved', 'catalog.error.portionsReserved', {
          params: { reserved: taken },
        });
      }
    }
    const now = clock.now().toISOString();
    tx.run(
      `INSERT INTO menu_days (date, published, updated_at) VALUES (?, 0, ?)
       ON CONFLICT (date) DO UPDATE SET updated_at = excluded.updated_at`,
      [date, now],
    );
    tx.run('DELETE FROM menu_items WHERE date = ?', [date]);
    entries.forEach((entry, position) => {
      tx.run(
        'INSERT INTO menu_items (date, dish_id, portion_limit, position) VALUES (?, ?, ?, ?)',
        [date, entry.dishId, entry.portionLimit, position],
      );
    });
    writeAudit(tx, clock, actorId, 'menu.save', `menu:${date}`, {
      items: entries.length,
    });
    return adminDay(tx, date, reserved);
  });
}

export function publishDay(
  db: Db,
  clock: Clock,
  date: string,
  reserved: ReservedProvider,
  actorId: number | null,
): AdminMenuDayDto {
  assertNotPast(clock, date);
  return db.tx((tx) => {
    const items = listItems(tx, date);
    if (items.length === 0) throw new AppError(400, 'menu_empty', 'catalog.error.menuEmpty');
    const day = getDay(tx, date);
    if (day?.published !== 1) {
      const now = clock.now().toISOString();
      tx.run(
        'UPDATE menu_days SET published = 1, published_at = ?, updated_at = ? WHERE date = ?',
        [now, now, date],
      );
      writeAudit(tx, clock, actorId, 'menu.publish', `menu:${date}`, { items: items.length });
    }
    return adminDay(tx, date, reserved);
  });
}

/** Копирует состав дня `fromDate` в черновик `date` (ротация). Опубликованный день не затирается. */
export function copyDay(
  db: Db,
  clock: Clock,
  date: string,
  fromDate: string,
  reserved: ReservedProvider,
  actorId: number | null,
): AdminMenuDayDto {
  assertNotPast(clock, date);
  return db.tx((tx) => {
    if (!getDay(tx, fromDate)) throw errors.notFound('catalog.error.menuNotFound');
    if (getDay(tx, date)?.published === 1) {
      throw new AppError(409, 'menu_published', 'catalog.error.menuPublished');
    }
    const source = tx.query<ItemRow>(
      `SELECT i.dish_id, i.portion_limit FROM menu_items i JOIN dishes d ON d.id = i.dish_id
       WHERE i.date = ? AND d.active = 1 ORDER BY i.position, i.dish_id`,
      [fromDate],
    );
    const now = clock.now().toISOString();
    tx.run(
      `INSERT INTO menu_days (date, published, updated_at) VALUES (?, 0, ?)
       ON CONFLICT (date) DO UPDATE SET updated_at = excluded.updated_at`,
      [date, now],
    );
    tx.run('DELETE FROM menu_items WHERE date = ?', [date]);
    source.forEach((row, position) => {
      tx.run(
        'INSERT INTO menu_items (date, dish_id, portion_limit, position) VALUES (?, ?, ?, ?)',
        [date, row.dish_id, row.portion_limit, position],
      );
    });
    writeAudit(tx, clock, actorId, 'menu.copy', `menu:${date}`, { fromDate, items: source.length });
    return adminDay(tx, date, reserved);
  });
}
