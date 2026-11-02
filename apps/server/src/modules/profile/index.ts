// Модуль profile: анкета цели, норма КБЖУ, удаление аккаунта, выгрузка данных клиента (R16, R17, R29).
// Публичный интерфейс для других модулей:
//   profileFor(deps)                         — сервис: saveProfile, getProfile, getTargets, deleteProfile,
//                                              deleteAccount, exportData, registerExportProvider, registerDeletionHook;
//   registerExportProvider(deps, name, fn)   — короткая запись для модулей с данными пользователя.
// Модуль с данными клиента (заказы, оценки, трекер, жалобы) при старте регистрирует поставщика выгрузки:
//   registerExportProvider(deps, 'orders', (userId) => ({ items: ... }))
// Поставщик получает только идентификатор текущего пользователя и отдаёт его данные, и ничьи больше.
// Если модуль хранит персональные данные, которые надо стереть вместе с аккаунтом, он ещё и вызывает
//   profileFor(deps).registerDeletionHook(name, (userId, db) => ...)  — хук идёт в одной транзакции с удалением.
import { calcTargets, type TargetsResult } from '@sportpit/shared/targets';
import {
  profileInputSchema,
  type DataExport,
  type ProfileInput,
  type ProfileResponse,
} from '@sportpit/shared/schemas/profile';
import type { AppDeps } from '../../app.ts';
import { authFor } from '../auth/index.ts';
import type { Db } from '../db/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { profileOwnerIds, readProfile, removeProfile, writeProfile } from './store.ts';

type MaybePromise<T> = T | Promise<T>;

/** Данные одного модуля о пользователе для выгрузки. Только его собственные. */
export type ExportProvider = (userId: number) => MaybePromise<unknown>;
/**
 * Стирание персональных данных модуля при удалении аккаунта. Выполняется СИНХРОННО в общей
 * транзакции: функция, вернувшая промис, не допускается ни типом (`then?: never`), ни во время
 * выполнения — иначе стирание ушло бы за пределы транзакции и откат его бы не отменил.
 */
export type DeletionHook = (userId: number, db: Db) => void | undefined | { then?: never };

export interface ProfileApi {
  /** Сохраняет анкету; без действующего согласия `health_data` — 403 `consent_required`, ничего не пишется. */
  saveProfile(userId: number, input: ProfileInput): ProfileResponse;
  /** Анкета и норма. Без согласия на данные о здоровье анкета и норма не отдаются (`healthConsent: false`). */
  getProfile(userId: number): ProfileResponse;
  /** Норма КБЖУ или `{ blocked }`; `null`, если анкеты нет или нет согласия. */
  getTargets(userId: number): TargetsResult | null;
  /** Стирает параметры тела (например, при отзыве согласия). */
  deleteProfile(userId: number): void;
  /** Стирает анкеты тех, кто явно отозвал согласие на данные о здоровье. Возвращает число стёртых. Идемпотентно. */
  purgeRevoked(): number;
  /** Стирает анкету и персональные поля пользователя, закрывает сессии. Заказы и журналы остаются без привязки к человеку. */
  deleteAccount(userId: number): void;
  /** Выгрузка данных одного пользователя: профиль, согласия и данные поставщиков. */
  exportData(userId: number): Promise<DataExport>;
  registerExportProvider(name: string, provider: ExportProvider): void;
  registerDeletionHook(name: string, hook: DeletionHook): void;
}

const isThenable = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

const PROVIDER_NAME = /^[a-z][a-z0-9_]{0,39}$/;

const instances = new WeakMap<object, ProfileApi>();

/** Сервис profile для приложения. Один на набор зависимостей. */
export function profileFor(deps: AppDeps): ProfileApi {
  const cached = instances.get(deps);
  if (cached) return cached;
  const { db, clock } = deps;
  const auth = authFor(deps);
  const exportProviders = new Map<string, ExportProvider>();
  const deletionHooks = new Map<string, DeletionHook>();

  /**
   * Явный отказ от согласия на текущую версию текста (последнее решение — «нет») стирает анкету.
   * Новая версия текста без отказа анкету не стирает: она лишь скрыта, пока человек не согласится заново.
   */
  const revokedHealth = (userId: number): boolean => {
    const state = auth.consents(userId).find((s) => s.kind === 'health_data')!;
    return !state.granted && state.decidedVersion === state.version;
  };
  const eraseIfRevoked = (userId: number): void => {
    if (revokedHealth(userId)) removeProfile(db, userId);
  };

  const view = (userId: number): ProfileResponse => {
    eraseIfRevoked(userId);
    const healthConsent = auth.hasConsent(userId, 'health_data');
    const profile = healthConsent ? readProfile(db, userId) : null;
    return {
      profile,
      targets: profile ? calcTargets(profile) : null,
      healthConsent,
    };
  };

  const register = <T>(map: Map<string, T>, kind: string, name: string, value: T): void => {
    if (!PROVIDER_NAME.test(name)) throw new Error(`${kind}: недопустимое имя «${name}»`);
    if (map.has(name)) throw new Error(`${kind} «${name}» уже зарегистрирован`);
    map.set(name, value);
  };

  const api: ProfileApi = {
    saveProfile(userId, input) {
      if (!auth.hasConsent(userId, 'health_data')) {
        throw new AppError(403, 'consent_required', 'auth.error.consentRequired');
      }
      writeProfile(db, clock, userId, profileInputSchema.parse(input));
      return view(userId);
    },
    getProfile: view,
    getTargets: (userId) => view(userId).targets,
    deleteProfile: (userId) => removeProfile(db, userId),
    purgeRevoked() {
      let erased = 0;
      for (const userId of profileOwnerIds(db)) {
        if (!revokedHealth(userId)) continue;
        removeProfile(db, userId);
        erased += 1;
      }
      return erased;
    },
    deleteAccount(userId) {
      if (!auth.getUser(userId)) throw errors.notFound('auth.error.userNotFound');
      db.tx((tx) => {
        for (const [name, hook] of deletionHooks) {
          const result: unknown = hook(userId, tx);
          if (isThenable(result)) {
            // промис уже запущен — его сбой не должен стать необработанным; аккаунт при этом остаётся целым
            Promise.resolve(result).catch(() => undefined);
            throw new Error(`Хук удаления «${name}» вернул промис: хук должен быть синхронным`);
          }
        }
        removeProfile(tx, userId);
        auth.anonymizeUser(userId);
      });
    },
    async exportData(userId) {
      const user = auth.getUser(userId);
      if (!user) throw errors.notFound('auth.error.userNotFound');
      eraseIfRevoked(userId);
      const data: Record<string, unknown> = {};
      // Неполная выгрузка хуже ошибки: сбой поставщика не скрывается, ответ будет 500 и запись в журнале.
      for (const [name, provider] of exportProviders) data[name] = await provider(userId);
      return {
        exportedAt: clock.now().toISOString(),
        user: { id: user.id, phone: user.phone, lang: user.lang },
        // сохранённая анкета отдаётся и при устаревшей версии согласия: это данные самого человека
        profile: readProfile(db, userId),
        consents: auth.consents(userId),
        data,
      };
    },
    registerExportProvider: (name, provider) =>
      register(exportProviders, 'Поставщик выгрузки', name, provider),
    registerDeletionHook: (name, hook) => register(deletionHooks, 'Хук удаления', name, hook),
  };
  instances.set(deps, api);
  return api;
}

/** Короткая запись для других модулей: `registerExportProvider(deps, 'orders', (userId) => ...)`. */
export function registerExportProvider(
  deps: AppDeps,
  name: string,
  provider: ExportProvider,
): void {
  profileFor(deps).registerExportProvider(name, provider);
}
