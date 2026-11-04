import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureAttribution,
  getAnalyticsConsent,
  getAttribution,
  getSignupAttribution,
  setAnalyticsConsent,
  track,
  trackLandingView,
} from '../../src/features/client/landing/tracker.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('источник из адреса (captureAttribution)', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['/?src=gym', { source: 'gym' }],
    ['/?src=trainer&ref=ivan_01', { source: 'trainer', ref: 'ivan_01' }],
    ['/?src=tg', { source: 'tg' }],
    ['/?src=ig&utm_campaign=Spring-26', { source: 'ig', campaign: 'spring-26' }],
    // utm_source разбирается в тот же набор
    ['/?utm_source=telegram', { source: 'tg' }],
    ['/?utm_source=t.me', { source: 'tg' }],
    ['/?utm_source=instagram', { source: 'ig' }],
    ['/?utm_source=newsletter', { source: 'other' }],
    // src главнее utm_source; неизвестный src не годится — берётся utm_source
    ['/?src=gym&utm_source=instagram', { source: 'gym' }],
    ['/?src=whatsapp&utm_source=instagram', { source: 'ig' }],
    // небезопасные ref и campaign отбрасываются
    ['/?src=gym&ref=a%20b%3Cscript%3E', { source: 'gym' }],
    ['/?src=gym&ref=' + 'x'.repeat(41), { source: 'gym' }],
    // метки без источника — прямой заход
    ['/?ref=hall7', { source: 'direct', ref: 'hall7' }],
  ];
  it.each(cases)('%s', (url, expected) => {
    expect(captureAttribution(url)).toEqual(expected);
  });

  it('без параметров источник «direct», а ранее сохранённый не затирается', () => {
    expect(captureAttribution('/')).toEqual({ source: 'direct' });
    captureAttribution('/?src=gym&ref=hall7');
    expect(captureAttribution('/ro')).toEqual({ source: 'gym', ref: 'hall7' });
    expect(getAttribution()).toEqual({ source: 'gym', ref: 'hall7' });
  });

  it('кладёт источник в sessionStorage, а в localStorage — только после согласия', () => {
    captureAttribution('/?src=tg');
    expect(window.sessionStorage.getItem('sportpit.src')).toContain('"tg"');
    expect(window.localStorage.getItem('sportpit.src')).toBeNull();

    setAnalyticsConsent('yes');
    expect(window.localStorage.getItem('sportpit.src')).toContain('"tg"');

    captureAttribution('/?src=ig');
    expect(window.localStorage.getItem('sportpit.src')).toContain('"ig"');
  });

  it('испорченное значение в хранилище игнорируется', () => {
    window.sessionStorage.setItem('sportpit.src', '{"source":"<b>","ref":"a b"}');
    expect(getAttribution()).toEqual({ source: 'direct' });
    window.sessionStorage.setItem('sportpit.src', 'не json');
    expect(getAttribution()).toEqual({ source: 'direct' });
  });
});

describe('согласие на аналитику и анонимный номер', () => {
  it('пока выбора нет — анонимного номера нет', () => {
    expect(getAnalyticsConsent()).toBeNull();
    expect(getAttribution().anonId).toBeUndefined();
    expect(window.localStorage.getItem('sportpit.aid')).toBeNull();
  });

  it('«Только необходимое» — номер не создаётся и не отправляется', () => {
    setAnalyticsConsent('no');
    expect(getAnalyticsConsent()).toBe('no');
    expect(window.localStorage.getItem('sportpit.analytics')).toBe('no');
    expect(window.localStorage.getItem('sportpit.aid')).toBeNull();
    expect(getAttribution().anonId).toBeUndefined();
  });

  it('«Принять» создаёт UUID в sportpit.aid и отправляет его', () => {
    setAnalyticsConsent('yes');
    const stored = window.localStorage.getItem('sportpit.aid');
    expect(stored).toMatch(UUID);
    expect(getAttribution().anonId).toBe(stored);
    // номер постоянный
    setAnalyticsConsent('yes');
    expect(window.localStorage.getItem('sportpit.aid')).toBe(stored);
  });

  it('передумал: «Только необходимое» стирает номер и сохранённый источник', () => {
    captureAttribution('/?src=gym');
    setAnalyticsConsent('yes');
    setAnalyticsConsent('no');
    expect(window.localStorage.getItem('sportpit.aid')).toBeNull();
    expect(window.localStorage.getItem('sportpit.src')).toBeNull();
    expect(getAttribution().anonId).toBeUndefined();
  });

  it('для входа атрибуция берётся, только если есть что передать', () => {
    expect(getSignupAttribution()).toBeUndefined();
    captureAttribution('/?src=trainer&ref=ivan');
    expect(getSignupAttribution()).toEqual({ source: 'trainer', ref: 'ivan' });
  });

  it('недоступное хранилище не ломает работу', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => setAnalyticsConsent('yes')).not.toThrow();
    expect(() => captureAttribution('/?src=gym')).not.toThrow();
    expect(getAnalyticsConsent()).toBeNull();
  });
});

describe('отправка событий', () => {
  const okFetch = () =>
    vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;

  it('landing_view уходит один раз за вкладку на адрес', async () => {
    const fetchMock = vi.fn(okFetch());
    vi.stubGlobal('fetch', fetchMock);
    trackLandingView('/');
    trackLandingView('/');
    trackLandingView('/ro');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(first).toEqual({ kind: 'landing_view', attribution: { source: 'direct' } });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/track');
  });

  it('событие несёт источник и, при согласии, анонимный номер', async () => {
    const fetchMock = vi.fn(okFetch());
    vi.stubGlobal('fetch', fetchMock);
    captureAttribution('/?src=ig&ref=post9');
    setAnalyticsConsent('yes');
    await track('calc_used');
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.kind).toBe('calc_used');
    expect(body.attribution).toMatchObject({ source: 'ig', ref: 'post9' });
    expect(body.attribution.anonId).toMatch(UUID);
  });

  it('сбой сети не бросает исключение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(track('landing_view')).resolves.toBeUndefined();
    trackLandingView('/legal');
    await new Promise((r) => setTimeout(r, 20));
  });
});
