// Предвыбранный холодильник: приложение открыто по QR или ссылке из зала (`?fridge=<id>`).
// Идентификатор запоминается в localStorage; оформление заказа (таск 06) читает его через getSelectedFridge().
import { ENTITY_ID_PATTERN } from '@sportpit/shared/schemas/admin';
import { readStored, writeStored } from '../../../app/storage.ts';

/** Ключ localStorage с идентификатором выбранного холодильника. */
export const FRIDGE_STORAGE_KEY = 'sportpit.fridge';

/** Идентификатор из строки запроса (`?fridge=...`); неверный вид или пусто — `null`. */
export function fridgeFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('fridge');
  return value !== null && ENTITY_ID_PATTERN.test(value) ? value : null;
}

export function getSelectedFridge(): string | null {
  const value = readStored(FRIDGE_STORAGE_KEY);
  return value !== null && ENTITY_ID_PATTERN.test(value) ? value : null;
}

export function setSelectedFridge(id: string): void {
  writeStored(FRIDGE_STORAGE_KEY, id);
}

export function clearSelectedFridge(): void {
  try {
    window.localStorage.removeItem(FRIDGE_STORAGE_KEY);
  } catch {
    // хранилище недоступно: выбор живёт до перезагрузки
  }
}

/** Запоминает холодильник из адреса, если он там есть; возвращает его. */
export function rememberFridgeFromUrl(search?: string): string | null {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const id = fridgeFromSearch(query);
  if (id) setSelectedFridge(id);
  return id;
}

/** Адрес, который кодируется в QR-плакате холодильника. */
export function fridgeLink(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, '')}/menu?fridge=${encodeURIComponent(id)}`;
}
