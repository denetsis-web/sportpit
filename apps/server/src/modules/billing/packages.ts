// Пакеты боксов: администратор меняет цену и состав без релиза. Купленное хранит снимок в purchases,
// поэтому правка пакета на уже купленное не влияет (R47).
import type { PackageCreate, PackageDto, PackageUpdate } from '@sportpit/shared/schemas/billing';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { errors } from '../system/errors.ts';

export interface PackageRow {
  id: number;
  boxes: number;
  price_per_box_bani: number;
  validity_days: number;
  active: number;
  sort_order: number;
}

export const toPackageDto = (row: PackageRow): PackageDto => ({
  id: row.id,
  boxes: row.boxes,
  pricePerBoxBani: row.price_per_box_bani,
  totalBani: row.boxes * row.price_per_box_bani,
  validityDays: row.validity_days,
  active: row.active === 1,
  sortOrder: row.sort_order,
});

const COLUMNS = 'id, boxes, price_per_box_bani, validity_days, active, sort_order';

export function getPackageRow(db: Db, id: number): PackageRow | undefined {
  return db.get<PackageRow>(`SELECT ${COLUMNS} FROM packages WHERE id = ?`, [id]);
}

export function listPackages(db: Db, options: { includeInactive?: boolean } = {}): PackageDto[] {
  const where = options.includeInactive ? '' : 'WHERE active = 1';
  return db
    .query<PackageRow>(
      `SELECT ${COLUMNS} FROM packages ${where} ORDER BY sort_order, boxes DESC, id`,
    )
    .map(toPackageDto);
}

export function createPackage(db: Db, clock: Clock, input: PackageCreate): PackageDto {
  const now = clock.now().toISOString();
  const { lastInsertRowid } = db.run(
    `INSERT INTO packages (boxes, price_per_box_bani, validity_days, active, sort_order, created_at, updated_at)
     VALUES (?, ?, 45, ?, ?, ?, ?)`,
    [
      input.boxes,
      input.pricePerBoxBani,
      input.active === false ? 0 : 1,
      input.sortOrder ?? 100,
      now,
      now,
    ],
  );
  return toPackageDto(getPackageRow(db, Number(lastInsertRowid))!);
}

export function updatePackage(db: Db, clock: Clock, id: number, patch: PackageUpdate): PackageDto {
  const existing = getPackageRow(db, id);
  if (!existing) throw errors.notFound('billing.error.packageNotFound');
  db.run(
    `UPDATE packages SET boxes = ?, price_per_box_bani = ?, active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?`,
    [
      patch.boxes ?? existing.boxes,
      patch.pricePerBoxBani ?? existing.price_per_box_bani,
      patch.active === undefined ? existing.active : patch.active ? 1 : 0,
      patch.sortOrder ?? existing.sort_order,
      clock.now().toISOString(),
      id,
    ],
  );
  return toPackageDto(getPackageRow(db, id)!);
}
