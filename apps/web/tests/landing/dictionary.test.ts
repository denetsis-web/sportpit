import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from '@sportpit/shared/schemas/admin';
import growthRo from '../../../../packages/shared/src/i18n/growth/ro.ts';
import growthRu from '../../../../packages/shared/src/i18n/growth/ru.ts';
import ro from '../../../../packages/shared/src/i18n/landing/ro.ts';
import ru from '../../../../packages/shared/src/i18n/landing/ru.ts';

// Словарь лендинга: оба языка, без медицинских обещаний и без «заказа на сегодня», без выдуманных ответов.

const dictionaries = { ru: ru as Record<string, string>, ro: ro as Record<string, string> };

const MEDICAL = {
  ru: /лечеб|излеч|исцел|диагноз|\bлечит|минус\s*\d+\s*кг|-\s?\d+\s*кг|сброс\w*\s+\d+\s*кг|гарантир|быстр\w*\s+похуд|поможет\s+похуд|за\s+\d+\s+дн\w*\s+похуд/i,
  ro: /tratament|vindec|diagnostic|garant|minus\s*\d+\s*kg|-\s?\d+\s*kg|slăb\w*\s+rapid|te ajută să slăbești/i,
};
const TODAY = {
  ru: /заказать на сегодня|заказ на сегодня|купить и забрать сегодня|забрать сегодня же/i,
  ro: /comand[ăa] pentru (azi|astăzi)|comand[ăa] pe azi|ridică (azi|astăzi) același/i,
};

describe('словарь landing', () => {
  it('ключи ru и ro совпадают, значения непустые', () => {
    expect(Object.keys(ro).sort()).toEqual(Object.keys(ru).sort());
    for (const lang of ['ru', 'ro'] as const) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('содержит мета-тексты для сервера и ключи бренда для обоих языков', () => {
    for (const key of [
      'meta.title',
      'meta.description',
      'meta.legal.title',
      'meta.legal.description',
      'brand.name',
      'brand.tagline',
      'links.telegram',
      'links.instagram',
    ]) {
      expect(ru, key).toHaveProperty([key]);
      expect(ro, key).toHaveProperty([key]);
    }
  });

  it('нет запрещённых медицинских формулировок ни в landing, ни в growth', () => {
    const all = {
      ru: {
        ...dictionaries.ru,
        ...Object.fromEntries(Object.entries(growthRu).map(([k, v]) => [`g.${k}`, v])),
      },
      ro: {
        ...dictionaries.ro,
        ...Object.fromEntries(Object.entries(growthRo).map(([k, v]) => [`g.${k}`, v])),
      },
    };
    for (const lang of ['ru', 'ro'] as const) {
      for (const [key, value] of Object.entries(all[lang])) {
        expect(value, `${lang}:${key}`).not.toMatch(MEDICAL[lang]);
      }
    }
  });

  it('нигде нет текстов «заказать на сегодня»', () => {
    for (const lang of ['ru', 'ro'] as const) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(value, `${lang}:${key}`).not.toMatch(TODAY[lang]);
      }
    }
  });

  it('ответы FAQ, юридические тексты, согласие и ссылки не выдуманы: везде [ВПИШИ]', () => {
    const placeholders = [
      'faq.a1',
      'faq.a2',
      'faq.a3',
      'faq.a4',
      'join.consent',
      'legal.terms.text',
      'legal.privacy.text',
      'legal.analytics.text',
      'legal.waitlist.text',
      'links.telegram',
      'links.instagram',
    ];
    for (const lang of ['ru', 'ro'] as const) {
      for (const key of placeholders)
        expect(dictionaries[lang][key], `${lang}:${key}`).toBe(PLACEHOLDER);
    }
  });

  it('в румынском нет транслитерации «KBJU»', () => {
    for (const value of Object.values(dictionaries.ro)) expect(value).not.toMatch(/KBJU|KBZH?U/i);
  });
});
