import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatTime,
  formatDecimal,
} from '@sportpit/shared/format';

const NBSP = ' ';

describe('formatMoney: деньги в банях, формат Молдовы', () => {
  it('целые леи без копеек: 119 лей / 119 lei', () => {
    expect(formatMoney(11900, 'ru')).toBe(`119${NBSP}лей`);
    expect(formatMoney(11900, 'ro')).toBe(`119${NBSP}lei`);
  });

  it('бани через запятую', () => {
    expect(formatMoney(12950, 'ru')).toBe(`129,50${NBSP}лей`);
    expect(formatMoney(1, 'ro')).toBe(`0,01${NBSP}lei`);
    expect(formatMoney(0, 'ru')).toBe(`0${NBSP}лей`);
  });

  it('тысячи разделяются неразрывным пробелом', () => {
    expect(formatMoney(123456789, 'ru')).toBe(`1${NBSP}234${NBSP}567,89${NBSP}лей`);
    expect(formatMoney(100000, 'ro')).toBe(`1${NBSP}000${NBSP}lei`);
  });

  it('по-румынски ровно один лей — «leu»', () => {
    expect(formatMoney(100, 'ro')).toBe(`1${NBSP}leu`);
    expect(formatMoney(100, 'ru')).toBe(`1${NBSP}лей`);
  });

  it('отрицательная сумма (возврат) и нецелое число бань', () => {
    expect(formatMoney(-5000, 'ru')).toBe(`-50${NBSP}лей`);
    expect(() => formatMoney(10.5, 'ru')).toThrow(RangeError);
  });
});

describe('formatDate: дд.мм.гггг по Кишинёву', () => {
  it('дата без времени форматируется как есть, одинаково на обоих языках', () => {
    expect(formatDate('2026-10-25', 'ru')).toBe('25.10.2026');
    expect(formatDate('2026-01-05', 'ro')).toBe('05.01.2026');
  });

  it('момент в UTC переводится в местную дату (зима UTC+2, лето UTC+3)', () => {
    expect(formatDate('2026-01-14T22:30:00Z', 'ru')).toBe('15.01.2026');
    expect(formatDate('2026-07-14T21:30:00Z', 'ro')).toBe('15.07.2026');
  });

  it('в день перевода часов местная дата считается правильно', () => {
    // 29 марта 2026 в 03:00 часы идут на +3; 22:30Z уже 30 марта 01:30
    expect(formatDate('2026-03-29T22:30:00Z', 'ru')).toBe('30.03.2026');
    // 25 октября 2026 часы возвращаются на +2; 21:30Z это 25 октября 23:30
    expect(formatDate('2026-10-25T21:30:00Z', 'ru')).toBe('25.10.2026');
  });

  it('время и дата со временем', () => {
    expect(formatTime('2026-10-25T15:00:00Z')).toBe('17:00');
    expect(formatDateTime('2026-07-01T09:05:00Z', 'ro')).toBe('01.07.2026 12:05');
  });

  it('мусор вместо даты — ошибка', () => {
    expect(() => formatDate('вчера', 'ru')).toThrow(RangeError);
    expect(() => formatDate('2026-02-31', 'ru')).toThrow(RangeError);
  });
});

describe('formatDecimal: десятичная запятая (F1.16)', () => {
  it('целые без изменений, дробные с запятой, без группировки разрядов', () => {
    expect(formatDecimal(5)).toBe('5');
    expect(formatDecimal(12.5)).toBe('12,5');
    expect(formatDecimal(0.25)).toBe('0,25');
    expect(formatDecimal(-3.5)).toBe('-3,5');
    expect(formatDecimal(1234.5)).toBe('1234,5');
  });

  it('с числом знаков округляет и не оставляет хвост: 2,04 → 2; 12,36 → 12,4', () => {
    expect(formatDecimal(2.04, 1)).toBe('2');
    expect(formatDecimal(12.36, 1)).toBe('12,4');
    expect(formatDecimal(7, 1)).toBe('7');
    expect(formatDecimal(0.126, 2)).toBe('0,13');
  });
});
