import { afterEach, describe, expect, it } from 'vitest';
import {
  FRIDGE_STORAGE_KEY,
  fridgeFromSearch,
  fridgeLink,
  getSelectedFridge,
  rememberFridgeFromUrl,
} from '../../src/features/client/menu/fridge.ts';

afterEach(() => window.localStorage.clear());

describe('предвыбранный холодильник: разбор адреса и хранение', () => {
  it('берёт идентификатор из ?fridge=, остальные параметры не мешают', () => {
    expect(fridgeFromSearch('?fridge=fr-main')).toBe('fr-main');
    expect(fridgeFromSearch('?utm=qr&fridge=gym_1-a&x=1')).toBe('gym_1-a');
  });

  it('пусто, нет параметра, чужой вид значения (разметка, пробелы, слишком длинное, заглавные) — не холодильник', () => {
    for (const search of [
      '',
      '?other=1',
      '?fridge=',
      '?fridge=%3Cscript%3E',
      '?fridge=a%20b',
      '?fridge=FR-1',
      '?fridge=x',
      `?fridge=${'a'.repeat(41)}`,
      '?fridge=../etc',
    ]) {
      expect(fridgeFromSearch(search), search).toBeNull();
    }
  });

  it('rememberFridgeFromUrl сохраняет только верный идентификатор и не затирает прежний неверным', () => {
    expect(rememberFridgeFromUrl('?fridge=fr-a')).toBe('fr-a');
    expect(getSelectedFridge()).toBe('fr-a');
    expect(rememberFridgeFromUrl('?fridge=%3Cb%3E')).toBeNull();
    expect(window.localStorage.getItem(FRIDGE_STORAGE_KEY)).toBe('fr-a');
  });

  it('испорченное значение в localStorage не читается как холодильник', () => {
    window.localStorage.setItem(FRIDGE_STORAGE_KEY, '<img onerror=1>');
    expect(getSelectedFridge()).toBeNull();
  });

  it('ссылка для QR: адрес сайта без лишнего слеша, идентификатор в ?fridge=', () => {
    expect(fridgeLink('https://sportpit.example/', 'fr-main')).toBe(
      'https://sportpit.example/menu?fridge=fr-main',
    );
    expect(fridgeFromSearch(new URL(fridgeLink('https://a.example', 'fr-main')).search)).toBe(
      'fr-main',
    );
  });
});
