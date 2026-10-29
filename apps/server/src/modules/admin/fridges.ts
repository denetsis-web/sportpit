// Холодильники: вместимость, срок приёма заказов, окно выдачи, необязательный код замка.
import type {
  FridgeDto,
  FridgeInput,
  FridgePatch,
  PublicFridgeDto,
} from '@sportpit/shared/schemas/admin';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { writeAudit } from './audit.ts';
import { idTaken, newEntityId } from './gyms.ts';

interface Row {
  id: string;
  gym_id: string;
  gym_name: string;
  gym_share: number;
  name: string;
  capacity_boxes: number;
  cutoff_time: string;
  pickup_from: string;
  pickup_to: string;
  access_code: string | null;
  active: number;
}

const SELECT = `SELECT f.id, f.gym_id, g.name AS gym_name, g.share_percent AS gym_share, f.name,
  f.capacity_boxes, f.cutoff_time, f.pickup_from, f.pickup_to, f.access_code, f.active
  FROM fridges f JOIN gyms g ON g.id = f.gym_id`;

const toDto = (row: Row): FridgeDto => ({
  id: row.id,
  gymId: row.gym_id,
  gymName: row.gym_name,
  gymSharePercent: row.gym_share,
  name: row.name,
  capacityBoxes: row.capacity_boxes,
  cutoffTime: row.cutoff_time,
  pickupFrom: row.pickup_from,
  pickupTo: row.pickup_to,
  accessCode: row.access_code,
  active: row.active === 1,
});

export function toPublicFridge(fridge: FridgeDto): PublicFridgeDto {
  return {
    id: fridge.id,
    gymId: fridge.gymId,
    gymName: fridge.gymName,
    name: fridge.name,
    capacityBoxes: fridge.capacityBoxes,
    cutoffTime: fridge.cutoffTime,
    pickupFrom: fridge.pickupFrom,
    pickupTo: fridge.pickupTo,
  };
}

export function getFridge(db: Db, id: string): FridgeDto | undefined {
  const row = db.get<Row>(`${SELECT} WHERE f.id = ?`, [String(id)]);
  return row ? toDto(row) : undefined;
}

export function listFridges(db: Db, options: { gymId?: string } = {}): FridgeDto[] {
  const rows = options.gymId
    ? db.query<Row>(`${SELECT} WHERE f.gym_id = ? ORDER BY g.name, f.name, f.id`, [options.gymId])
    : db.query<Row>(`${SELECT} ORDER BY g.name, f.name, f.id`);
  return rows.map(toDto);
}

/** Холодильник, который видит клиент: активный, в активном зале. */
export function getPublicFridge(db: Db, id: string): PublicFridgeDto | undefined {
  const row = db.get<Row>(`${SELECT} WHERE f.id = ? AND f.active = 1 AND g.active = 1`, [id]);
  return row ? toPublicFridge(toDto(row)) : undefined;
}

export function listPublicFridges(db: Db): PublicFridgeDto[] {
  return db
    .query<Row>(`${SELECT} WHERE f.active = 1 AND g.active = 1 ORDER BY g.name, f.name, f.id`)
    .map((row) => toPublicFridge(toDto(row)));
}

function assertWindow(from: string, to: string): void {
  if (from >= to) {
    throw new AppError(400, 'validation_failed', 'core.error.validation', {
      fields: { pickupTo: 'admin.error.window' },
    });
  }
}

function assertGym(db: Db, gymId: string): void {
  if (!db.get('SELECT 1 AS x FROM gyms WHERE id = ?', [gymId])) {
    throw new AppError(400, 'validation_failed', 'core.error.validation', {
      fields: { gymId: 'admin.error.gym' },
    });
  }
}

export function createFridge(
  db: Db,
  clock: Clock,
  input: FridgeInput,
  actorId: number | null,
): FridgeDto {
  assertWindow(input.pickupFrom, input.pickupTo);
  const id = input.id ?? newEntityId('fridge');
  const now = clock.now().toISOString();
  return db.tx((tx) => {
    assertGym(tx, input.gymId);
    if (tx.get('SELECT 1 AS x FROM fridges WHERE id = ?', [id])) throw idTaken();
    tx.run(
      `INSERT INTO fridges (id, gym_id, name, capacity_boxes, cutoff_time, pickup_from, pickup_to,
         access_code, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.gymId,
        input.name,
        input.capacityBoxes,
        input.cutoffTime,
        input.pickupFrom,
        input.pickupTo,
        input.accessCode,
        input.active === false ? 0 : 1,
        now,
        now,
      ],
    );
    // код замка не попадает в журнал: он нужен только администратору и клиентам с заказом
    writeAudit(tx, clock, actorId, 'fridge.create', `fridge:${id}`, {
      name: input.name,
      gymId: input.gymId,
      capacityBoxes: input.capacityBoxes,
    });
    return getFridge(tx, id)!;
  });
}

export function updateFridge(
  db: Db,
  clock: Clock,
  id: string,
  patch: FridgePatch,
  actorId: number | null,
): FridgeDto {
  return db.tx((tx) => {
    const current = getFridge(tx, id);
    if (!current) throw errors.notFound('admin.error.fridgeNotFound');
    const next = {
      gymId: patch.gymId ?? current.gymId,
      name: patch.name ?? current.name,
      capacityBoxes: patch.capacityBoxes ?? current.capacityBoxes,
      cutoffTime: patch.cutoffTime ?? current.cutoffTime,
      pickupFrom: patch.pickupFrom ?? current.pickupFrom,
      pickupTo: patch.pickupTo ?? current.pickupTo,
      accessCode: patch.accessCode === undefined ? current.accessCode : patch.accessCode,
      active: patch.active ?? current.active,
    };
    assertWindow(next.pickupFrom, next.pickupTo);
    if (next.gymId !== current.gymId) assertGym(tx, next.gymId);
    tx.run(
      `UPDATE fridges SET gym_id = ?, name = ?, capacity_boxes = ?, cutoff_time = ?, pickup_from = ?,
         pickup_to = ?, access_code = ?, active = ?, updated_at = ? WHERE id = ?`,
      [
        next.gymId,
        next.name,
        next.capacityBoxes,
        next.cutoffTime,
        next.pickupFrom,
        next.pickupTo,
        next.accessCode,
        next.active ? 1 : 0,
        clock.now().toISOString(),
        id,
      ],
    );
    const { accessCode, ...visible } = patch;
    writeAudit(tx, clock, actorId, 'fridge.update', `fridge:${id}`, {
      changes: visible,
      ...(accessCode !== undefined ? { accessCodeChanged: true } : {}),
    });
    return getFridge(tx, id)!;
  });
}
