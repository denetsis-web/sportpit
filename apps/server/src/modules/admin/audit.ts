// Журнал действий администратора (R55): записи только добавляются.
import type { AuditEntryDto } from '@sportpit/shared/schemas/admin';
import type { Db } from '../db/index.ts';
import type { Clock } from '../clock/index.ts';

interface Row {
  id: number;
  user_id: number | null;
  action: string;
  target: string;
  detail: string | null;
  created_at: string;
}

export function writeAudit(
  db: Db,
  clock: Clock,
  userId: number | null,
  action: string,
  target: string,
  detail?: Record<string, unknown>,
): void {
  db.run(
    'INSERT INTO admin_audit (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    [
      userId,
      action,
      target,
      detail && Object.keys(detail).length > 0 ? JSON.stringify(detail) : null,
      clock.now().toISOString(),
    ],
  );
}

function toDto(row: Row): AuditEntryDto {
  let detail: Record<string, unknown> | null = null;
  if (row.detail) {
    try {
      detail = JSON.parse(row.detail) as Record<string, unknown>;
    } catch {
      detail = null;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    target: row.target,
    detail,
    createdAt: row.created_at,
  };
}

export function listAudit(
  db: Db,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): { items: AuditEntryDto[]; total: number } {
  const rows = db.query<Row>(
    'SELECT id, user_id, action, target, detail, created_at FROM admin_audit ORDER BY id DESC LIMIT ? OFFSET ?',
    [Math.min(Math.max(limit, 1), 200), Math.max(offset, 0)],
  );
  const total = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM admin_audit')!.n;
  return { items: rows.map(toDto), total };
}
