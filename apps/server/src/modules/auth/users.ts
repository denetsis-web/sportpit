// Пользователи, роли и холодильники оператора. Функции принимают `db` и `clock`,
// поэтому их же использует команда `npm run create-user` (без запуска сервера).
import type { Lang } from '@sportpit/shared/i18n';
import type { AuthUserDto } from '@sportpit/shared/schemas/auth';
import { ROLES, type Role } from '@sportpit/shared/types';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';

export type AuthUser = AuthUserDto;

interface UserRow {
  id: number;
  phone: string | null;
  role: Role;
  lang: Lang;
}

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

function fridgesOf(db: Db, userId: number): string[] {
  return db
    .query<{ fridge_id: string }>(
      'SELECT fridge_id FROM operator_fridges WHERE user_id = ? ORDER BY fridge_id',
      [userId],
    )
    .map((r) => r.fridge_id);
}

function toUser(db: Db, row: UserRow): AuthUser {
  return {
    id: row.id,
    phone: row.phone ?? '',
    role: row.role,
    lang: row.lang,
    fridgeIds: row.role === 'operator' ? fridgesOf(db, row.id) : [],
  };
}

export function findUserById(db: Db, id: number): AuthUser | undefined {
  const row = db.get<UserRow>(
    'SELECT id, phone, role, lang FROM users WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return row ? toUser(db, row) : undefined;
}

export function findUserByPhone(db: Db, phone: string): AuthUser | undefined {
  const row = db.get<UserRow>(
    'SELECT id, phone, role, lang FROM users WHERE phone = ? AND deleted_at IS NULL',
    [phone],
  );
  return row ? toUser(db, row) : undefined;
}

export interface NewUser {
  phone: string;
  role?: Role;
  lang?: Lang;
}

export function createUser(db: Db, clock: Clock, input: NewUser): AuthUser {
  const { lastInsertRowid } = db.run(
    'INSERT INTO users (phone, role, lang, created_at) VALUES (?, ?, ?, ?)',
    [input.phone, input.role ?? 'client', input.lang ?? 'ru', clock.now().toISOString()],
  );
  return findUserById(db, Number(lastInsertRowid))!;
}

/** Создаёт пользователя с ролью или меняет роль существующему (для команды create-user). */
export function upsertUserWithRole(
  db: Db,
  clock: Clock,
  phone: string,
  role: Role,
): { user: AuthUser; created: boolean } {
  return db.tx((tx) => {
    const existing = findUserByPhone(tx, phone);
    if (!existing) return { user: createUser(tx, clock, { phone, role }), created: true };
    tx.run('UPDATE users SET role = ? WHERE id = ?', [role, existing.id]);
    return { user: findUserById(tx, existing.id)!, created: false };
  });
}

export function setUserRole(db: Db, userId: number, role: Role): AuthUser {
  const changes = db.run('UPDATE users SET role = ? WHERE id = ? AND deleted_at IS NULL', [
    role,
    userId,
  ]).changes;
  if (changes === 0) throw new AppError(404, 'user_not_found', 'auth.error.userNotFound');
  return findUserById(db, userId)!;
}

/** Заменяет список холодильников оператора. Идентификаторы хранятся как строки. */
export function setOperatorFridges(
  db: Db,
  userId: number,
  fridgeIds: Array<string | number>,
): AuthUser {
  return db.tx((tx) => {
    if (!findUserById(tx, userId)) {
      throw new AppError(404, 'user_not_found', 'auth.error.userNotFound');
    }
    tx.run('DELETE FROM operator_fridges WHERE user_id = ?', [userId]);
    for (const id of new Set(fridgeIds.map(String))) {
      tx.run('INSERT INTO operator_fridges (user_id, fridge_id) VALUES (?, ?)', [userId, id]);
    }
    return findUserById(tx, userId)!;
  });
}

export function listUsers(db: Db, limit = 100, offset = 0): AuthUser[] {
  return db
    .query<UserRow>(
      'SELECT id, phone, role, lang FROM users WHERE deleted_at IS NULL ORDER BY id LIMIT ? OFFSET ?',
      [limit, offset],
    )
    .map((row) => toUser(db, row));
}

export function userIdsByRole(db: Db, role: Role): number[] {
  return db
    .query<{ id: number }>(
      'SELECT id FROM users WHERE role = ? AND deleted_at IS NULL ORDER BY id',
      [role],
    )
    .map((r) => r.id);
}

export function setUserLang(db: Db, userId: number, lang: Lang): AuthUser {
  db.run('UPDATE users SET lang = ? WHERE id = ? AND deleted_at IS NULL', [lang, userId]);
  const user = findUserById(db, userId);
  if (!user) throw new AppError(404, 'user_not_found', 'auth.error.userNotFound');
  return user;
}

export function touchLogin(db: Db, clock: Clock, userId: number): void {
  db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [clock.now().toISOString(), userId]);
}

/** Меняет телефон (подтверждённый кодом на новый номер — проверку делает вызывающий). */
export function replacePhone(db: Db, userId: number, newPhone: string): AuthUser {
  const holder = findUserByPhone(db, newPhone);
  if (holder && holder.id !== userId) {
    throw new AppError(409, 'phone_taken', 'auth.error.phoneTaken');
  }
  db.run('UPDATE users SET phone = ? WHERE id = ? AND deleted_at IS NULL', [newPhone, userId]);
  const user = findUserById(db, userId);
  if (!user) throw new AppError(404, 'user_not_found', 'auth.error.userNotFound');
  return user;
}

/**
 * Удаление аккаунта (R29): стирает телефон, закрывает сессии и снимает привязку к холодильникам.
 * Строка пользователя остаётся пустой, чтобы заказы и журналы ссылались на «анонимного».
 * История согласий сохраняется (доказательство того, что согласие было).
 */
export function anonymizeUser(db: Db, clock: Clock, userId: number): void {
  db.tx((tx) => {
    const row = tx.get<{ phone: string | null }>(
      'SELECT phone FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId],
    );
    if (!row) throw new AppError(404, 'user_not_found', 'auth.error.userNotFound');
    if (row.phone) tx.run('DELETE FROM otp_codes WHERE phone = ?', [row.phone]);
    tx.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    tx.run('DELETE FROM operator_fridges WHERE user_id = ?', [userId]);
    tx.run("UPDATE users SET phone = NULL, role = 'client', deleted_at = ? WHERE id = ?", [
      clock.now().toISOString(),
      userId,
    ]);
  });
}
