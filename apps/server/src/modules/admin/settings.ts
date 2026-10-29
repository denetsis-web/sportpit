// Настройки одним местом (ключ → JSON). Нет строки — действует значение по умолчанию.
import {
  isSettingKey,
  SETTING_DEFAULTS,
  settingSchemas,
  type SettingKey,
  type SettingValues,
} from '@sportpit/shared/schemas/admin';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { writeAudit } from './audit.ts';

function assertKey(key: string): asserts key is SettingKey {
  if (!isSettingKey(key)) throw new RangeError(`Неизвестная настройка: ${key}`);
}

export function readSetting<K extends SettingKey>(db: Db, key: K): SettingValues[K] {
  assertKey(key);
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return SETTING_DEFAULTS[key];
  try {
    return settingSchemas[key].parse(JSON.parse(row.value)) as SettingValues[K];
  } catch {
    // повреждённое значение не должно ломать заказы: действует значение по умолчанию
    return SETTING_DEFAULTS[key];
  }
}

export function readAllSettings(db: Db): SettingValues {
  return {
    maxBoxesPerDay: readSetting(db, 'maxBoxesPerDay'),
    toleranceNote: readSetting(db, 'toleranceNote'),
    stockBufferPercent: readSetting(db, 'stockBufferPercent'),
    labelSize: readSetting(db, 'labelSize'),
    supportContacts: readSetting(db, 'supportContacts'),
  };
}

/** Сохраняет значение, проверив его схемой ключа (ошибка — исключение zod), и пишет в журнал. */
export function writeSetting<K extends SettingKey>(
  db: Db,
  clock: Clock,
  key: K,
  value: SettingValues[K],
  actorId: number | null,
): void {
  assertKey(key);
  const checked = settingSchemas[key].parse(value);
  db.tx((tx) => {
    tx.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(checked), clock.now().toISOString()],
    );
    writeAudit(tx, clock, actorId, 'settings.update', `setting:${key}`, { value: checked });
  });
}
