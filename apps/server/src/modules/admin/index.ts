// Модуль admin: залы, холодильники, настройки и журнал действий администратора.
// Другие модули пользуются так (один набор зависимостей — один сервис):
//   adminFor(deps).getFridge(id)            — вместимость, сроки, окно выдачи, код замка, зал и его доля;
//   adminFor(deps).getSetting('maxBoxesPerDay') / setSetting(key, value, actorId);
//   adminFor(deps).audit(userId, 'refund.create', 'purchase:12', { credits: 3 }).
// То же короткими функциями: audit(deps, ...), getFridge(deps, id), getSetting(deps, key).
import type {
  AuditEntryDto,
  FridgeDto,
  FridgeInput,
  FridgePatch,
  GymDto,
  GymInput,
  GymPatch,
  PublicFridgeDto,
  SettingKey,
  SettingValues,
} from '@sportpit/shared/schemas/admin';
import type { AppDeps } from '../../app.ts';
import { listAudit, writeAudit } from './audit.ts';
import {
  createFridge,
  DEFAULT_CUTOFF,
  getFridge as readFridge,
  getPublicFridge,
  listFridges,
  listPublicFridges,
  updateFridge,
} from './fridges.ts';
import { createGym, getGym, listGyms, updateGym } from './gyms.ts';
import { readAllSettings, readSetting, writeSetting } from './settings.ts';

export type AdminDeps = Pick<AppDeps, 'db' | 'clock'>;

export interface AdminApi {
  /** Запись в журнал действий администратора. `userId` — null для действий системы. */
  audit(
    userId: number | null,
    action: string,
    target: string,
    detail?: Record<string, unknown>,
  ): void;
  listAudit(options?: { limit?: number; offset?: number }): {
    items: AuditEntryDto[];
    total: number;
  };

  listGyms(): GymDto[];
  getGym(id: string): GymDto | undefined;
  createGym(input: GymInput, actorId: number | null): GymDto;
  updateGym(id: string, patch: GymPatch, actorId: number | null): GymDto;

  listFridges(options?: { gymId?: string }): FridgeDto[];
  /** Холодильник со всеми параметрами для правил заказа; нет такого — `undefined`. */
  getFridge(id: string): FridgeDto | undefined;
  /**
   * Момент, до которого принимаются заказы на день выдачи `date` (срок холодильника в день D−1 по Кишинёву).
   * Единственное место расчёта: заказы, кухня и выдача спрашивают срок здесь. Нет такого холодильника — срок по умолчанию 18:00.
   */
  cutoffAt(fridgeId: string, date: string): Date;
  /** Время срока приёма заказов холодильника (`HH:MM`); нет такого холодильника — 18:00. */
  cutoffTimeOf(fridgeId: string): string;
  createFridge(input: FridgeInput, actorId: number | null): FridgeDto;
  updateFridge(id: string, patch: FridgePatch, actorId: number | null): FridgeDto;
  listPublicFridges(): PublicFridgeDto[];
  getPublicFridge(id: string): PublicFridgeDto | undefined;

  getSetting<K extends SettingKey>(key: K): SettingValues[K];
  allSettings(): SettingValues;
  /** Сохраняет проверенное значение и пишет `settings.update` в журнал. */
  setSetting<K extends SettingKey>(key: K, value: SettingValues[K], actorId: number | null): void;
}

const instances = new WeakMap<object, AdminApi>();

export function adminFor(deps: AdminDeps): AdminApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock } = deps;
  const cutoffTimeOf = (fridgeId: string): string =>
    readFridge(db, fridgeId)?.cutoffTime ?? DEFAULT_CUTOFF;
  const api: AdminApi = {
    audit: (userId, action, target, detail) =>
      writeAudit(db, clock, userId, action, target, detail),
    listAudit: (options) => listAudit(db, options),
    listGyms: () => listGyms(db),
    getGym: (id) => getGym(db, id),
    createGym: (input, actorId) => createGym(db, clock, input, actorId),
    updateGym: (id, patch, actorId) => updateGym(db, clock, id, patch, actorId),
    listFridges: (options) => listFridges(db, options),
    getFridge: (id) => readFridge(db, id),
    cutoffTimeOf,
    cutoffAt: (fridgeId, date) => clock.cutoffFor(date, cutoffTimeOf(fridgeId)),
    createFridge: (input, actorId) => createFridge(db, clock, input, actorId),
    updateFridge: (id, patch, actorId) => updateFridge(db, clock, id, patch, actorId),
    listPublicFridges: () => listPublicFridges(db),
    getPublicFridge: (id) => getPublicFridge(db, id),
    getSetting: (key) => readSetting(db, key),
    allSettings: () => readAllSettings(db),
    setSetting: (key, value, actorId) => writeSetting(db, clock, key, value, actorId),
  };
  instances.set(deps, api);
  return api;
}

/** Короткая запись: `audit(deps, userId, action, target, detail?)`. */
export function audit(
  deps: AdminDeps,
  userId: number | null,
  action: string,
  target: string,
  detail?: Record<string, unknown>,
): void {
  adminFor(deps).audit(userId, action, target, detail);
}

export function getFridge(deps: AdminDeps, id: string): FridgeDto | undefined {
  return adminFor(deps).getFridge(id);
}

export function getSetting<K extends SettingKey>(deps: AdminDeps, key: K): SettingValues[K] {
  return adminFor(deps).getSetting(key);
}
