// Залы: создание, правка, отключение. Удаления нет — зал только отключается (заказы ссылаются на него).
import { randomBytes } from 'node:crypto';
import type { GymDto, GymInput, GymPatch } from '@sportpit/shared/schemas/admin';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { writeAudit } from './audit.ts';

interface Row {
  id: string;
  name: string;
  address: string | null;
  share_percent: number;
  active: number;
}

const COLUMNS = 'id, name, address, share_percent, active';

const toDto = (row: Row): GymDto => ({
  id: row.id,
  name: row.name,
  address: row.address,
  sharePercent: row.share_percent,
  active: row.active === 1,
});

export function newEntityId(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

export const idTaken = () => new AppError(409, 'id_taken', 'admin.error.idTaken');

export function listGyms(db: Db): GymDto[] {
  return db.query<Row>(`SELECT ${COLUMNS} FROM gyms ORDER BY name, id`).map(toDto);
}

export function getGym(db: Db, id: string): GymDto | undefined {
  const row = db.get<Row>(`SELECT ${COLUMNS} FROM gyms WHERE id = ?`, [id]);
  return row ? toDto(row) : undefined;
}

export function createGym(db: Db, clock: Clock, input: GymInput, actorId: number | null): GymDto {
  const id = input.id ?? newEntityId('gym');
  const now = clock.now().toISOString();
  return db.tx((tx) => {
    if (tx.get('SELECT 1 AS x FROM gyms WHERE id = ?', [id])) throw idTaken();
    tx.run(
      `INSERT INTO gyms (id, name, address, share_percent, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.address && input.address !== '' ? input.address : null,
        input.sharePercent,
        input.active === false ? 0 : 1,
        now,
        now,
      ],
    );
    writeAudit(tx, clock, actorId, 'gym.create', `gym:${id}`, { name: input.name });
    return getGym(tx, id)!;
  });
}

export function updateGym(
  db: Db,
  clock: Clock,
  id: string,
  patch: GymPatch,
  actorId: number | null,
): GymDto {
  return db.tx((tx) => {
    const current = getGym(tx, id);
    if (!current) throw errors.notFound('admin.error.gymNotFound');
    const next = {
      name: patch.name ?? current.name,
      address: patch.address === undefined ? current.address : patch.address || null,
      sharePercent: patch.sharePercent ?? current.sharePercent,
      active: patch.active ?? current.active,
    };
    tx.run(
      'UPDATE gyms SET name = ?, address = ?, share_percent = ?, active = ?, updated_at = ? WHERE id = ?',
      [
        next.name,
        next.address,
        next.sharePercent,
        next.active ? 1 : 0,
        clock.now().toISOString(),
        id,
      ],
    );
    writeAudit(tx, clock, actorId, 'gym.update', `gym:${id}`, { changes: patch });
    return getGym(tx, id)!;
  });
}
