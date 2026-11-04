// События воронки и источник регистрации: запись в таблицы funnel_events и signup_attribution.
import type { Attribution, AttributionSource } from '@sportpit/shared/schemas/growth';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';

export type FunnelEventKind = 'landing_view' | 'calc_used' | 'waitlist_join' | 'signup';

/** Источник в том виде, в каком он хранится: без атрибуции — `direct`, пустые метки — `null`. */
export interface ResolvedAttribution {
  source: AttributionSource;
  ref: string | null;
  campaign: string | null;
  anonId: string | null;
}

export function resolveAttribution(attribution: Attribution | undefined): ResolvedAttribution {
  return {
    source: attribution?.source ?? 'direct',
    ref: attribution?.ref ?? null,
    campaign: attribution?.campaign ?? null,
    anonId: attribution?.anonId ?? null,
  };
}

export function recordEvent(
  db: Db,
  clock: Pick<Clock, 'now'>,
  kind: FunnelEventKind,
  attribution: ResolvedAttribution,
): void {
  db.run(
    `INSERT INTO funnel_events (kind, source, ref, campaign, anon_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      kind,
      attribution.source,
      attribution.ref,
      attribution.campaign,
      attribution.anonId,
      clock.now().toISOString(),
    ],
  );
}

export function saveSignupAttribution(
  db: Db,
  clock: Pick<Clock, 'now'>,
  userId: number,
  attribution: ResolvedAttribution,
): void {
  db.run(
    `INSERT INTO signup_attribution (user_id, source, ref, campaign, anon_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      attribution.source,
      attribution.ref,
      attribution.campaign,
      attribution.anonId,
      clock.now().toISOString(),
    ],
  );
}

/** Стирает источник регистрации пользователя (удаление аккаунта). */
export function deleteSignupAttribution(db: Db, userId: number): void {
  db.run('DELETE FROM signup_attribution WHERE user_id = ?', [userId]);
}
