// Блюда: создание, правка, отключение, фото. Удаления нет — блюдо только отключается (заказы ссылаются на него).
import type {
  AdminDishDto,
  Allergen,
  DishInput,
  DishPatch,
  Goal,
} from '@sportpit/shared/schemas/catalog';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { writeAudit } from '../admin/audit.ts';
import { errors } from '../system/errors.ts';

export interface DishRow {
  id: number;
  name_ru: string;
  name_ro: string;
  composition_ru: string;
  composition_ro: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  weight_g: number;
  allergens: string;
  goals: string;
  vegetarian: number;
  shelf_life_hours: number;
  photo_key: string | null;
  active: number;
}

export const DISH_COLUMNS = `id, name_ru, name_ro, composition_ru, composition_ro, calories, protein_g,
  fat_g, carbs_g, fiber_g, weight_g, allergens, goals, vegetarian, shelf_life_hours, photo_key, active`;

function parseList<T extends string>(raw: string): T[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function toAdminDish(row: DishRow, photoUrl: (key: string) => string): AdminDishDto {
  return {
    id: row.id,
    name: { ru: row.name_ru, ro: row.name_ro },
    composition: { ru: row.composition_ru, ro: row.composition_ro },
    calories: row.calories,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    carbsG: row.carbs_g,
    fiberG: row.fiber_g,
    weightG: row.weight_g,
    allergens: parseList<Allergen>(row.allergens),
    goals: parseList<Goal>(row.goals),
    vegetarian: row.vegetarian === 1,
    shelfLifeHours: row.shelf_life_hours,
    photoUrl: row.photo_key ? photoUrl(row.photo_key) : null,
    active: row.active === 1,
  };
}

export function getDishRow(db: Db, id: number): DishRow | undefined {
  return db.get<DishRow>(`SELECT ${DISH_COLUMNS} FROM dishes WHERE id = ?`, [id]);
}

export function listDishRows(db: Db): DishRow[] {
  return db.query<DishRow>(`SELECT ${DISH_COLUMNS} FROM dishes ORDER BY id`);
}

export function createDish(
  db: Db,
  clock: Clock,
  input: DishInput,
  actorId: number | null,
): DishRow {
  const now = clock.now().toISOString();
  return db.tx((tx) => {
    const { lastInsertRowid } = tx.run(
      `INSERT INTO dishes (name_ru, name_ro, composition_ru, composition_ro, calories, protein_g, fat_g,
         carbs_g, fiber_g, weight_g, allergens, goals, vegetarian, shelf_life_hours, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.nameRu,
        input.nameRo,
        input.compositionRu,
        input.compositionRo,
        input.calories,
        input.proteinG,
        input.fatG,
        input.carbsG,
        input.fiberG,
        input.weightG,
        JSON.stringify(input.allergens),
        JSON.stringify(input.goals),
        input.vegetarian ? 1 : 0,
        input.shelfLifeHours,
        input.active ? 1 : 0,
        now,
        now,
      ],
    );
    const id = Number(lastInsertRowid);
    writeAudit(tx, clock, actorId, 'dish.create', `dish:${id}`, { name: input.nameRu });
    return getDishRow(tx, id)!;
  });
}

export function updateDish(
  db: Db,
  clock: Clock,
  id: number,
  patch: DishPatch,
  actorId: number | null,
): DishRow {
  return db.tx((tx) => {
    const current = getDishRow(tx, id);
    if (!current) throw errors.notFound('catalog.error.dishNotFound');
    const next = {
      nameRu: patch.nameRu ?? current.name_ru,
      nameRo: patch.nameRo ?? current.name_ro,
      compositionRu: patch.compositionRu ?? current.composition_ru,
      compositionRo: patch.compositionRo ?? current.composition_ro,
      calories: patch.calories ?? current.calories,
      proteinG: patch.proteinG ?? current.protein_g,
      fatG: patch.fatG ?? current.fat_g,
      carbsG: patch.carbsG ?? current.carbs_g,
      fiberG: patch.fiberG ?? current.fiber_g,
      weightG: patch.weightG ?? current.weight_g,
      allergens:
        patch.allergens !== undefined ? JSON.stringify(patch.allergens) : current.allergens,
      goals: patch.goals !== undefined ? JSON.stringify(patch.goals) : current.goals,
      vegetarian: patch.vegetarian !== undefined ? (patch.vegetarian ? 1 : 0) : current.vegetarian,
      shelfLifeHours: patch.shelfLifeHours ?? current.shelf_life_hours,
      active: patch.active !== undefined ? (patch.active ? 1 : 0) : current.active,
    };
    tx.run(
      `UPDATE dishes SET name_ru = ?, name_ro = ?, composition_ru = ?, composition_ro = ?, calories = ?,
         protein_g = ?, fat_g = ?, carbs_g = ?, fiber_g = ?, weight_g = ?, allergens = ?, goals = ?,
         vegetarian = ?, shelf_life_hours = ?, active = ?, updated_at = ? WHERE id = ?`,
      [
        next.nameRu,
        next.nameRo,
        next.compositionRu,
        next.compositionRo,
        next.calories,
        next.proteinG,
        next.fatG,
        next.carbsG,
        next.fiberG,
        next.weightG,
        next.allergens,
        next.goals,
        next.vegetarian,
        next.shelfLifeHours,
        next.active,
        clock.now().toISOString(),
        id,
      ],
    );
    writeAudit(tx, clock, actorId, 'dish.update', `dish:${id}`, { changes: patch });
    return getDishRow(tx, id)!;
  });
}

/** Записывает ключ фото (или `null`) и пишет в журнал; возвращает прежний ключ. */
export function setDishPhotoKey(
  db: Db,
  clock: Clock,
  id: number,
  key: string | null,
  actorId: number | null,
): string | null {
  return db.tx((tx) => {
    const current = getDishRow(tx, id);
    if (!current) throw errors.notFound('catalog.error.dishNotFound');
    tx.run('UPDATE dishes SET photo_key = ?, updated_at = ? WHERE id = ?', [
      key,
      clock.now().toISOString(),
      id,
    ]);
    writeAudit(tx, clock, actorId, key ? 'dish.photo' : 'dish.photo.remove', `dish:${id}`);
    return current.photo_key;
  });
}
