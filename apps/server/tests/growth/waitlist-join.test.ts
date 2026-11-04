// Публичный приём записи в лист ожидания: согласие, повторы, приманка для ботов, лимиты, событие воронки.
import { describe, expect, it } from 'vitest';
import {
  ANON_A,
  attribution,
  countRows,
  DAY,
  eventsOf,
  HOUR,
  joinBody,
  makeApp,
  phoneN,
  post,
} from './helpers.ts';

interface EntryRow {
  phone: string;
  name: string | null;
  gym: string | null;
  goal: string | null;
  lang: string;
  source: string;
  ref: string | null;
  campaign: string | null;
  anon_id: string | null;
  consent_version: string;
  consent_at: string;
  created_at: string;
}

const entries = (test: Awaited<ReturnType<typeof makeApp>>) =>
  test.app.deps.db.query<EntryRow>('SELECT * FROM waitlist_entries ORDER BY id');

describe('POST /waitlist: проверка данных', () => {
  it('без согласия — 400 и записи нет (нет поля и consent: false)', async () => {
    const test = await makeApp();
    const { consent: _omitted, ...withoutConsent } = joinBody();
    for (const body of [withoutConsent, joinBody({ consent: false })]) {
      const res = await post(test, '/waitlist', body);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toHaveProperty('consent');
    }
    expect(countRows(test, 'waitlist_entries')).toBe(0);
  });

  it('неверный телефон — 400 с полем phone в fields', async () => {
    const test = await makeApp();
    const res = await post(test, '/waitlist', joinBody({ phone: '+37312345' }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toHaveProperty('phone');
    expect(countRows(test, 'waitlist_entries')).toBe(0);
  });

  it('верные данные — 200 { ok: true } и одна строка с версией и временем согласия', async () => {
    const test = await makeApp();
    const res = await post(
      test,
      '/waitlist',
      joinBody({ name: '  Анна ', gym: 'Ботаника', goal: 'maintain', lang: 'ro' }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const rows = entries(test);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      phone: phoneN(1),
      name: 'Анна',
      gym: 'Ботаника',
      goal: 'maintain',
      lang: 'ro',
      source: 'direct',
      anon_id: null,
      consent_version: '2026-11-04',
      consent_at: '2026-03-10T09:00:00.000Z',
      created_at: '2026-03-10T09:00:00.000Z',
    });
  });
});

describe('POST /waitlist: повторы и боты', () => {
  it('тот же номер — тот же ответ, второй строки нет, поля первой не меняются, события нет', async () => {
    const test = await makeApp();
    const first = await post(test, '/waitlist', joinBody({ name: 'Анна', gym: 'Ботаника' }));
    test.clock.advance(HOUR);
    const again = await post(
      test,
      '/waitlist',
      joinBody({ name: 'Другое', gym: 'Рышкановка', attribution: attribution() }),
    );
    expect(again.statusCode).toBe(200);
    expect(again.body).toBe(first.body);
    expect(entries(test)).toHaveLength(1);
    expect(entries(test)[0]).toMatchObject({ name: 'Анна', gym: 'Ботаника', source: 'direct' });
    expect(eventsOf(test, 'waitlist_join')).toHaveLength(1);
  });

  it('заполненное скрытое поле website — ответ ok, но записи и события нет', async () => {
    const test = await makeApp();
    const res = await post(test, '/waitlist', joinBody({ website: 'http://spam.invalid' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(countRows(test, 'waitlist_entries')).toBe(0);
    expect(eventsOf(test, 'waitlist_join')).toHaveLength(0);
  });

  it('31-й запрос за час с одного адреса — 429, другой адрес не задет, через час можно снова', async () => {
    const test = await makeApp();
    for (let i = 1; i <= 30; i++) {
      const res = await post(test, '/waitlist', joinBody({ phone: phoneN(i) }), { ip: '10.0.0.1' });
      expect(res.statusCode, `запрос ${i}`).toBe(200);
    }
    const blocked = await post(test, '/waitlist', joinBody({ phone: phoneN(31) }), {
      ip: '10.0.0.1',
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('rate_limited');
    expect(countRows(test, 'waitlist_entries')).toBe(30);

    const other = await post(test, '/waitlist', joinBody({ phone: phoneN(31) }), {
      ip: '10.0.0.2',
    });
    expect(other.statusCode).toBe(200);

    test.clock.advance(HOUR + 1000);
    const later = await post(test, '/waitlist', joinBody({ phone: phoneN(32) }), {
      ip: '10.0.0.1',
    });
    expect(later.statusCode).toBe(200);
  });

  it('4-й запрос за сутки на один номер — 429 (с разных адресов), через сутки можно снова', async () => {
    const test = await makeApp();
    for (let i = 1; i <= 3; i++) {
      const res = await post(test, '/waitlist', joinBody(), { ip: `10.0.1.${i}` });
      expect(res.statusCode, `запрос ${i}`).toBe(200);
    }
    const fourth = await post(test, '/waitlist', joinBody(), { ip: '10.0.1.4' });
    expect(fourth.statusCode).toBe(429);
    expect(entries(test)).toHaveLength(1);

    test.clock.advance(DAY + 1000);
    const later = await post(test, '/waitlist', joinBody(), { ip: '10.0.1.5' });
    expect(later.statusCode).toBe(200);
  });

  it('без X-Requested-With — 403 (общее правило записи)', async () => {
    const test = await makeApp();
    const res = await post(test, '/waitlist', joinBody(), { bare: true });
    expect(res.statusCode).toBe(403);
    expect(countRows(test, 'waitlist_entries')).toBe(0);
  });
});

describe('POST /waitlist: источник и анонимный номер', () => {
  it('новая запись пишет событие waitlist_join с источником; anonId хранится в записи и событии', async () => {
    const test = await makeApp();
    await post(
      test,
      '/waitlist',
      joinBody({
        attribution: attribution({
          source: 'gym',
          ref: 'botanica',
          campaign: 'poster',
          anonId: ANON_A,
        }),
      }),
    );
    expect(entries(test)[0]).toMatchObject({
      source: 'gym',
      ref: 'botanica',
      campaign: 'poster',
      anon_id: ANON_A,
    });
    expect(eventsOf(test, 'waitlist_join')).toEqual([
      {
        kind: 'waitlist_join',
        source: 'gym',
        ref: 'botanica',
        campaign: 'poster',
        anon_id: ANON_A,
      },
    ]);
  });

  it('без anonId номер нигде не хранится', async () => {
    const test = await makeApp();
    await post(test, '/waitlist', joinBody({ attribution: attribution() }));
    expect(entries(test)[0]!.anon_id).toBeNull();
    expect(eventsOf(test, 'waitlist_join')[0]!.anon_id).toBeNull();
  });

  it('небезопасные метки и неизвестный источник отклоняются', async () => {
    const test = await makeApp();
    for (const bad of [
      attribution({ ref: 'Bad Ref!' }),
      attribution({ campaign: 'x'.repeat(41) }),
      attribution({ source: 'facebook' }),
      attribution({ anonId: 'not-a-uuid' }),
    ]) {
      const res = await post(test, '/waitlist', joinBody({ attribution: bad }));
      expect(res.statusCode).toBe(400);
    }
    expect(countRows(test, 'waitlist_entries')).toBe(0);
  });
});
