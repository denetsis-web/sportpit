import { describe, expect, it } from 'vitest';
import { createManualClock, createSystemClock } from '../src/modules/clock/index.ts';

const iso = (d: Date) => d.toISOString();

describe('Clock.cutoffFor: срок приёма заказов на день D — D−1 в заданное время по Кишинёву', () => {
  const clock = createManualClock('2026-01-01T00:00:00Z');

  it('зимой (UTC+2): 18:00 это 16:00 UTC', () => {
    expect(iso(clock.cutoffFor('2026-01-15', '18:00'))).toBe('2026-01-14T16:00:00.000Z');
  });

  it('летом (UTC+3): 18:00 это 15:00 UTC', () => {
    expect(iso(clock.cutoffFor('2026-07-15', '18:00'))).toBe('2026-07-14T15:00:00.000Z');
  });

  it('день весеннего перевода часов 29 марта 2026: срок на 30 марта — уже по +3', () => {
    expect(iso(clock.cutoffFor('2026-03-30', '18:00'))).toBe('2026-03-29T15:00:00.000Z');
    // срок на 29 марта выпадает на 28 марта — ещё зима
    expect(iso(clock.cutoffFor('2026-03-29', '18:00'))).toBe('2026-03-28T16:00:00.000Z');
  });

  it('день осеннего перевода часов 25 октября 2026: срок на 26 октября — уже по +2', () => {
    expect(iso(clock.cutoffFor('2026-10-26', '18:00'))).toBe('2026-10-25T16:00:00.000Z');
    expect(iso(clock.cutoffFor('2026-10-25', '18:00'))).toBe('2026-10-24T15:00:00.000Z');
  });

  it('время, которого нет из-за перевода (03:30 29 марта), сдвигается вперёд', () => {
    // 03:30 не существует; ближайшее реальное 04:30 EEST = 01:30 UTC
    expect(iso(clock.cutoffFor('2026-03-30', '03:30'))).toBe('2026-03-29T01:30:00.000Z');
  });

  it('время, которое бывает дважды (03:30 25 октября), берётся первое', () => {
    // первое вхождение — ещё летнее время (+3): 00:30 UTC
    expect(iso(clock.cutoffFor('2026-10-26', '03:30'))).toBe('2026-10-25T00:30:00.000Z');
  });

  it('неверные аргументы — ошибка', () => {
    expect(() => clock.cutoffFor('2026-13-01', '18:00')).toThrow(RangeError);
    expect(() => clock.cutoffFor('2026-01-15', '25:00')).toThrow(RangeError);
  });
});

describe('Clock.localDate: местная дата Кишинёва', () => {
  const clock = createManualClock('2026-01-01T00:00:00Z');

  it('после 22:00 UTC зимой уже следующий день', () => {
    expect(clock.localDate(new Date('2026-01-14T21:59:00Z'))).toBe('2026-01-14');
    expect(clock.localDate(new Date('2026-01-14T22:00:00Z'))).toBe('2026-01-15');
  });

  it('в день перехода на зимнее время граница суток сдвигается на час', () => {
    expect(clock.localDate(new Date('2026-10-25T21:30:00Z'))).toBe('2026-10-25');
    expect(clock.localDate(new Date('2026-10-25T22:00:00Z'))).toBe('2026-10-26');
  });

  it('без аргумента берёт текущее время часов', () => {
    clock.set('2026-07-14T21:30:00Z');
    expect(clock.localDate()).toBe('2026-07-15');
  });
});

describe('подмена часов в тестах', () => {
  it('ручные часы стоят на месте, пока их не сдвинули', () => {
    const clock = createManualClock('2026-03-01T10:00:00Z');
    expect(iso(clock.now())).toBe('2026-03-01T10:00:00.000Z');
    clock.advance(90 * 60 * 1000);
    expect(iso(clock.now())).toBe('2026-03-01T11:30:00.000Z');
    clock.set(new Date('2026-04-01T00:00:00Z'));
    expect(iso(clock.now())).toBe('2026-04-01T00:00:00.000Z');
  });

  it('ручные часы возвращают копию, а не свой внутренний объект', () => {
    const clock = createManualClock('2026-03-01T10:00:00Z');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('системные часы идут по настоящему времени', () => {
    const before = Date.now();
    const value = createSystemClock().now().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});
