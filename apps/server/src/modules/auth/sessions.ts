// Сессии: случайный токен лежит в cookie, в базе — только его SHA-256.
import { createHash, randomBytes } from 'node:crypto';
import { SESSION_TTL_DAYS } from '@sportpit/shared/schemas/auth';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { findUserById, type AuthUser } from './users.ts';

export const SESSION_COOKIE = 'sp_session';
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface SessionService {
  create(userId: number): { token: string; expiresAt: string };
  /** Пользователь по токену из cookie; пусто, если токена нет, он истёк или аккаунт удалён. */
  resolve(token: string | undefined): AuthUser | null;
  destroy(token: string | undefined): void;
  /** Удаляет истёкшие сессии. */
  purge(): number;
}

export function createSessionService(db: Db, clock: Clock): SessionService {
  return {
    create(userId) {
      const token = randomBytes(32).toString('base64url');
      const now = clock.now();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
      db.run(
        'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [hashToken(token), userId, now.toISOString(), expiresAt],
      );
      return { token, expiresAt };
    },
    resolve(token) {
      if (!token || token.length > 200) return null;
      const row = db.get<{ user_id: number }>(
        'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?',
        [hashToken(token), clock.now().toISOString()],
      );
      return row ? (findUserById(db, row.user_id) ?? null) : null;
    },
    destroy(token) {
      if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    },
    purge() {
      return db.run('DELETE FROM sessions WHERE expires_at <= ?', [clock.now().toISOString()])
        .changes;
    },
  };
}
