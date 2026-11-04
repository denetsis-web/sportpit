// Публичные события лендинга: POST /track.
import { describe, expect, it } from 'vitest';
import { ANON_A, attribution, countRows, eventsOf, makeApp, post } from './helpers.ts';

describe('POST /track', () => {
  it('landing_view и calc_used с атрибуцией — 204 и по строке в журнале событий', async () => {
    const test = await makeApp();
    const view = await post(test, '/track', {
      kind: 'landing_view',
      attribution: attribution({ source: 'ig', ref: 'post-1', campaign: 'nov' }),
    });
    const calc = await post(test, '/track', {
      kind: 'calc_used',
      attribution: attribution({ source: 'ig', anonId: ANON_A }),
    });
    expect(view.statusCode).toBe(204);
    expect(view.body).toBe('');
    expect(calc.statusCode).toBe(204);
    expect(eventsOf(test, 'landing_view')).toEqual([
      { kind: 'landing_view', source: 'ig', ref: 'post-1', campaign: 'nov', anon_id: null },
    ]);
    expect(eventsOf(test, 'calc_used')).toEqual([
      { kind: 'calc_used', source: 'ig', ref: null, campaign: null, anon_id: ANON_A },
    ]);
  });

  it('неизвестный вид, вид сервера и неверное тело — 400, события не пишутся', async () => {
    const test = await makeApp();
    for (const body of [
      { kind: 'page_unload', attribution: attribution() },
      { kind: 'waitlist_join', attribution: attribution() },
      { kind: 'signup', attribution: attribution() },
      { kind: 'landing_view' },
      { kind: 'landing_view', attribution: attribution({ source: 'vk' }) },
    ]) {
      expect((await post(test, '/track', body)).statusCode).toBe(400);
    }
    expect(countRows(test, 'funnel_events')).toBe(0);
  });

  it('121-й запрос за минуту с одного адреса — 429, другой адрес не задет, через минуту можно', async () => {
    const test = await makeApp();
    const body = { kind: 'landing_view', attribution: attribution() };
    for (let i = 1; i <= 120; i++) {
      const res = await post(test, '/track', body, { ip: '10.0.0.1' });
      expect(res.statusCode, `запрос ${i}`).toBe(204);
    }
    expect((await post(test, '/track', body, { ip: '10.0.0.1' })).statusCode).toBe(429);
    expect((await post(test, '/track', body, { ip: '10.0.0.2' })).statusCode).toBe(204);
    test.clock.advance(61_000);
    expect((await post(test, '/track', body, { ip: '10.0.0.1' })).statusCode).toBe(204);
  });

  it('без X-Requested-With — 403 (общее правило записи)', async () => {
    const test = await makeApp();
    const res = await post(
      test,
      '/track',
      { kind: 'landing_view', attribution: attribution() },
      { bare: true },
    );
    expect(res.statusCode).toBe(403);
    expect(countRows(test, 'funnel_events')).toBe(0);
  });
});
