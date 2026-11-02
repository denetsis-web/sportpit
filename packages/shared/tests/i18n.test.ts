import { beforeEach, describe, expect, it } from 'vitest';
import {
  getNamespaces,
  hasKey,
  registerDictionaries,
  registerNamespace,
  resetDictionaries,
  t,
} from '@sportpit/shared/i18n';

type DictModule = { default: Record<string, string> };
const ruModules = import.meta.glob<DictModule>('../src/i18n/*/ru.ts', { eager: true });
const roModules = import.meta.glob<DictModule>('../src/i18n/*/ro.ts', { eager: true });

function byNamespace(modules: Record<string, DictModule>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const ns = /i18n\/([^/]+)\//.exec(path)![1]!;
    out[ns] = mod.default;
  }
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

const ru = byNamespace(ruModules);
const ro = byNamespace(roModules);
const allModules = { ...ruModules, ...roModules };

describe('словари: пространства имён ru и ro', () => {
  it('есть базовое пространство core', () => {
    expect(Object.keys(ru)).toContain('core');
    expect(Object.keys(ro)).toContain('core');
  });

  it('у каждого пространства есть оба языка', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(ro).sort());
  });

  it('ключи ru и ro совпадают во всех пространствах', () => {
    for (const ns of Object.keys(ru)) {
      expect(Object.keys(ro[ns] ?? {}).sort(), `пространство ${ns}`).toEqual(
        Object.keys(ru[ns]!).sort(),
      );
    }
  });

  it('значения непустые, а параметры {name} одинаковы в обоих языках', () => {
    for (const ns of Object.keys(ru)) {
      for (const [key, value] of Object.entries(ru[ns]!)) {
        const other = ro[ns]?.[key];
        expect(value.trim(), `${ns}.${key} (ru)`).not.toBe('');
        expect(other?.trim(), `${ns}.${key} (ro)`).toBeTruthy();
        expect(placeholders(other!), `${ns}.${key}`).toEqual(placeholders(value));
      }
    }
  });

  it('в румынском нет транслитерации «KBJU»/«KBZhU»: единый термин «valori nutriționale» / «calorii și macro»', () => {
    for (const [ns, dict] of Object.entries(ro)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${ns}.${key}`).not.toMatch(/KBJU|KBZH?U/i);
      }
    }
  });

  it('кнопки и действия в румынском — одной формой обращения (повелительное на «tu»), без «Alegeți»/«Salvați»', () => {
    const action =
      /(^|.)(action|button|save|submit|add|confirm|cancel|retry|remove|open|close)(.|$)/;
    const politePlural = /^[p{L}-]+(ați|eți|iți|âți)(s|$)/u;
    for (const [ns, dict] of Object.entries(ro)) {
      for (const [key, value] of Object.entries(dict)) {
        if (action.test(key)) expect(value, `${ns}.${key}`).not.toMatch(politePlural);
      }
    }
  });

  it('слоган заведён в core на обоих языках', () => {
    registerDictionaries(allModules);
    expect(t('ru', 'core.slogan')).toBe('Вкусно. Свежо. Чётко по КБЖУ');
    expect(t('ro', 'core.slogan')).not.toBe('core.slogan');
    expect(t('ro', 'core.slogan')).not.toBe(t('ru', 'core.slogan'));
  });
});

describe('t(lang, key, params)', () => {
  beforeEach(() => resetDictionaries());

  it('собирает пространства из путей модулей и подставляет параметры', () => {
    registerDictionaries({
      '/x/i18n/demo/ru.ts': { default: { wait: 'Подождите {n} сек' } },
      '/x/i18n/demo/ro.ts': { default: { wait: 'Așteptați {n} sec' } },
    });
    expect(getNamespaces()).toEqual(['demo']);
    expect(t('ru', 'demo.wait', { n: 30 })).toBe('Подождите 30 сек');
    expect(t('ro', 'demo.wait', { n: 30 })).toBe('Așteptați 30 sec');
  });

  it('ключ с точкой внутри пространства и несколько пространств', () => {
    registerNamespace('a', 'ru', { 'b.c': 'вложенный' });
    registerNamespace('z', 'ru', { x: 'иной' });
    expect(t('ru', 'a.b.c')).toBe('вложенный');
    expect(t('ru', 'z.x')).toBe('иной');
  });

  it('если перевода нет — русский, а если нет и его — сам ключ', () => {
    registerNamespace('only', 'ru', { k: 'только русский' });
    expect(t('ro', 'only.k')).toBe('только русский');
    expect(t('ro', 'only.nope')).toBe('only.nope');
    expect(hasKey('only.k')).toBe(true);
    expect(hasKey('only.nope')).toBe(false);
  });

  it('параметр, которого не передали, остаётся на месте', () => {
    registerNamespace('p', 'ru', { k: 'Привет, {name}!' });
    expect(t('ru', 'p.k')).toBe('Привет, {name}!');
  });
});
