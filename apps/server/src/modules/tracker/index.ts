// Модуль tracker: дневные итоги питания и ручные записи (R04, R28).
// Другие модули пользуются так:
//   trackerFor(deps).dayTotals(userId, date) · weekTotals(userId, date)       — итоги дня и недели;
//   trackerFor(deps).addEntry(userId, input) · updateEntry(...) · deleteEntry(...) — ручные записи.
// Итог дня = боксы заказов в статусе «выдан» (считаются из заказов, не копируются) + ручные записи.
// Цель читается из анкеты через profile.getTargets; нет анкеты — цели нет.
// Модуль подключает к профилю выгрузку «tracker» и хук удаления аккаунта «tracker».
import {
  NUTRITION_KEYS,
  weekStart,
  type EntryInput,
  type EntryPatch,
  type Nutrition,
  type TrackerBoxDto,
  type TrackerDayDto,
  type TrackerEntryDto,
  type TrackerWeekDto,
} from '@sportpit/shared/schemas/tracker';
import { addDaysISO } from '@sportpit/shared/time';
import type { AppDeps } from '../../app.ts';
import { ordersFor } from '../orders/index.ts';
import { profileFor } from '../profile/index.ts';
import { AppError } from '../system/errors.ts';

interface EntryRow {
  id: number;
  user_id: number;
  date: string;
  name: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  created_at: string;
}

export interface TrackerApi {
  dayTotals(userId: number, date?: string): TrackerDayDto;
  weekTotals(userId: number, date?: string): TrackerWeekDto;
  addEntry(userId: number, input: EntryInput): TrackerEntryDto;
  updateEntry(userId: number, id: number, patch: EntryPatch): TrackerEntryDto;
  deleteEntry(userId: number, id: number): void;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const zero = (): Nutrition => ({ calories: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 });

function add(a: Nutrition, b: Nutrition): Nutrition {
  const sum = zero();
  for (const key of NUTRITION_KEYS) sum[key] = a[key] + b[key];
  return sum;
}

function rounded(n: Nutrition): Nutrition {
  const out = zero();
  for (const key of NUTRITION_KEYS) out[key] = round1(n[key]);
  return out;
}

const toEntry = (row: EntryRow): TrackerEntryDto => ({
  id: row.id,
  date: row.date,
  name: row.name,
  calories: row.calories,
  proteinG: row.protein_g,
  fatG: row.fat_g,
  carbsG: row.carbs_g,
  fiberG: row.fiber_g,
  createdAt: row.created_at,
});

const instances = new WeakMap<object, TrackerApi>();

/** Сервис трекера для приложения. Один на набор зависимостей. */
export function trackerFor(deps: AppDeps): TrackerApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock } = deps;
  const orders = ordersFor(deps);
  const profile = profileFor(deps);

  /** Выданные боксы клиента по дням: порция × количество по каждой позиции заказа. */
  function boxesBetween(userId: number, from: string, to: string): Map<string, TrackerBoxDto[]> {
    const byDate = new Map<string, TrackerBoxDto[]>();
    for (const order of orders.listForExport(userId)) {
      if (order.status !== 'picked_up' || order.date < from || order.date > to) continue;
      const total = zero();
      for (const item of order.items) {
        total.calories += item.calories * item.qty;
        total.proteinG += item.proteinG * item.qty;
        total.fatG += item.fatG * item.qty;
        total.carbsG += item.carbsG * item.qty;
        total.fiberG += item.fiberG * item.qty;
      }
      const box: TrackerBoxDto = {
        orderId: order.id,
        ...rounded(total),
        items: order.items.map((i) => ({ dishId: i.dishId, name: i.name, qty: i.qty })),
      };
      const list = byDate.get(order.date) ?? [];
      list.push(box);
      byDate.set(order.date, list);
    }
    return byDate;
  }

  function entriesBetween(userId: number, from: string, to: string): TrackerEntryDto[] {
    return db
      .query<EntryRow>(
        'SELECT * FROM tracker_entries WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date, id',
        [userId, from, to],
      )
      .map(toEntry);
  }

  function targetOf(userId: number): { target: Nutrition | null; targetBlocked: boolean } {
    const result = profile.getTargets(userId);
    if (!result) return { target: null, targetBlocked: false };
    if ('blocked' in result) return { target: null, targetBlocked: true };
    return {
      target: {
        calories: result.kcal,
        proteinG: result.proteinG,
        fatG: result.fatG,
        carbsG: result.carbG,
        fiberG: result.fiberG,
      },
      targetBlocked: false,
    };
  }

  function sumOf(boxes: Nutrition[], entries: Nutrition[]): Nutrition {
    return rounded([...boxes, ...entries].reduce(add, zero()));
  }

  const api: TrackerApi = {
    dayTotals(userId, date) {
      const day = date ?? clock.localDate();
      const boxes = boxesBetween(userId, day, day).get(day) ?? [];
      const entries = entriesBetween(userId, day, day);
      return {
        date: day,
        today: clock.localDate(),
        total: sumOf(boxes, entries),
        boxes,
        entries,
        ...targetOf(userId),
        empty: boxes.length === 0 && entries.length === 0,
      };
    },

    weekTotals(userId, date) {
      const from = weekStart(date ?? clock.localDate());
      const to = addDaysISO(from, 6);
      const boxes = boxesBetween(userId, from, to);
      const entries = entriesBetween(userId, from, to);
      const days = Array.from({ length: 7 }, (_, i) => {
        const day = addDaysISO(from, i);
        const dayBoxes = boxes.get(day) ?? [];
        const dayEntries = entries.filter((e) => e.date === day);
        return {
          date: day,
          total: sumOf(dayBoxes, dayEntries),
          boxes: dayBoxes.length,
          entries: dayEntries.length,
        };
      });
      return {
        from,
        to,
        today: clock.localDate(),
        days,
        ...targetOf(userId),
        empty: days.every((d) => d.boxes === 0 && d.entries === 0),
      };
    },

    addEntry(userId, input) {
      const now = clock.now().toISOString();
      const { lastInsertRowid } = db.run(
        `INSERT INTO tracker_entries
           (user_id, date, name, calories, protein_g, fat_g, carbs_g, fiber_g, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          input.date,
          input.name,
          input.calories,
          input.proteinG,
          input.fatG,
          input.carbsG,
          input.fiberG,
          now,
          now,
        ],
      );
      return toEntry(
        db.get<EntryRow>('SELECT * FROM tracker_entries WHERE id = ?', [Number(lastInsertRowid)])!,
      );
    },

    updateEntry(userId, id, patch) {
      const row = db.get<EntryRow>('SELECT * FROM tracker_entries WHERE id = ? AND user_id = ?', [
        id,
        userId,
      ]);
      if (!row) throw new AppError(404, 'entry_not_found', 'tracker.error.entryNotFound');
      db.run(
        `UPDATE tracker_entries
            SET date = ?, name = ?, calories = ?, protein_g = ?, fat_g = ?, carbs_g = ?, fiber_g = ?,
                updated_at = ?
          WHERE id = ? AND user_id = ?`,
        [
          patch.date ?? row.date,
          patch.name ?? row.name,
          patch.calories ?? row.calories,
          patch.proteinG ?? row.protein_g,
          patch.fatG ?? row.fat_g,
          patch.carbsG ?? row.carbs_g,
          patch.fiberG ?? row.fiber_g,
          clock.now().toISOString(),
          id,
          userId,
        ],
      );
      return toEntry(db.get<EntryRow>('SELECT * FROM tracker_entries WHERE id = ?', [id])!);
    },

    deleteEntry(userId, id) {
      const { changes } = db.run('DELETE FROM tracker_entries WHERE id = ? AND user_id = ?', [
        id,
        userId,
      ]);
      if (changes === 0) throw new AppError(404, 'entry_not_found', 'tracker.error.entryNotFound');
    },
  };
  instances.set(deps, api);

  // Выгрузка данных клиента (только его ручные записи) и стирание их при удалении аккаунта.
  profile.registerExportProvider('tracker', (userId) => ({
    entries: db
      .query<EntryRow>('SELECT * FROM tracker_entries WHERE user_id = ? ORDER BY date, id', [
        userId,
      ])
      .map(toEntry),
  }));
  profile.registerDeletionHook('tracker', (userId, tx) => {
    tx.run('DELETE FROM tracker_entries WHERE user_id = ?', [userId]);
  });
  return api;
}
