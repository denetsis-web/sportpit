// Хранение анкеты: одна строка на пользователя. Согласие проверяет вызывающий (index.ts).
import type { ProfileData, ProfileDto } from '@sportpit/shared/schemas/profile';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';

interface ProfileRow {
  sex: ProfileDto['sex'];
  age: number;
  height_cm: number;
  weight_kg: number;
  goal: ProfileDto['goal'];
  activity: ProfileDto['activity'];
  has_condition: number;
  updated_at: string;
}

export function readProfile(db: Db, userId: number): ProfileDto | null {
  const row = db.get<ProfileRow>(
    `SELECT sex, age, height_cm, weight_kg, goal, activity, has_condition, updated_at
     FROM profiles WHERE user_id = ?`,
    [userId],
  );
  if (!row) return null;
  return {
    sex: row.sex,
    age: row.age,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    goal: row.goal,
    activity: row.activity,
    hasCondition: row.has_condition === 1,
    updatedAt: row.updated_at,
  };
}

export function writeProfile(db: Db, clock: Clock, userId: number, input: ProfileData): void {
  db.run(
    `INSERT INTO profiles (user_id, sex, age, height_cm, weight_kg, goal, activity, has_condition, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       sex = excluded.sex, age = excluded.age, height_cm = excluded.height_cm,
       weight_kg = excluded.weight_kg, goal = excluded.goal, activity = excluded.activity,
       has_condition = excluded.has_condition, updated_at = excluded.updated_at`,
    [
      userId,
      input.sex,
      input.age,
      input.heightCm,
      input.weightKg,
      input.goal,
      input.activity,
      input.hasCondition ? 1 : 0,
      clock.now().toISOString(),
    ],
  );
}

export function removeProfile(db: Db, userId: number): void {
  db.run('DELETE FROM profiles WHERE user_id = ?', [userId]);
}

/** Кто хранит анкету (для ночной чистки). */
export function profileOwnerIds(db: Db): number[] {
  return db
    .query<{ user_id: number }>('SELECT user_id FROM profiles ORDER BY user_id')
    .map((r) => r.user_id);
}
