// Согласия (R16.1, R56): записи только добавляются, действует последняя по виду согласия.
// Согласие считается данным, если последняя запись положительная и дана на действующую версию текста.
import {
  CONSENT_KINDS,
  CONSENT_VERSIONS,
  type ConsentChange,
  type ConsentKind,
  type ConsentState,
} from '@sportpit/shared/schemas/auth';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';

interface ConsentRow {
  version: string;
  granted: number;
  created_at: string;
}

function latest(db: Db, userId: number, kind: ConsentKind): ConsentRow | undefined {
  return db.get<ConsentRow>(
    'SELECT version, granted, created_at FROM consents WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1',
    [userId, kind],
  );
}

export function consentStates(db: Db, userId: number): ConsentState[] {
  return CONSENT_KINDS.map((kind) => {
    const row = latest(db, userId, kind);
    return {
      kind,
      version: CONSENT_VERSIONS[kind],
      granted: row !== undefined && row.granted === 1 && row.version === CONSENT_VERSIONS[kind],
      decidedVersion: row?.version ?? null,
      decidedAt: row?.created_at ?? null,
    };
  });
}

export function hasConsent(db: Db, userId: number, kind: ConsentKind): boolean {
  return consentStates(db, userId).find((s) => s.kind === kind)!.granted;
}

/**
 * Записывает решения человека. Все изменения — одной транзакцией. Версия должна совпасть с действующей:
 * иначе человек согласился бы на текст, которого уже нет. Повторное то же решение историю не раздувает.
 */
export function recordConsents(
  db: Db,
  clock: Clock,
  userId: number,
  changes: readonly ConsentChange[],
): ConsentState[] {
  db.tx((tx) => {
    for (const change of changes) {
      if (change.version !== CONSENT_VERSIONS[change.kind]) {
        throw new AppError(400, 'consent_version', 'auth.error.consentVersion');
      }
      const last = latest(tx, userId, change.kind);
      if (last && last.version === change.version && (last.granted === 1) === change.granted) {
        continue;
      }
      tx.run(
        'INSERT INTO consents (user_id, kind, version, granted, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, change.kind, change.version, change.granted ? 1 : 0, clock.now().toISOString()],
      );
    }
  });
  return consentStates(db, userId);
}
