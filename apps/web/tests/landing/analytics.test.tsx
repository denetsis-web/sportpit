import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiError, grantedConsents, user } from '../auth/fakeApi.ts';
import { cleanUp, open, serve } from './render.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { captureAttribution } from '../../src/features/client/landing/tracker.ts';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanUp);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const notice = () => screen.findByRole('region', { name: 'Аналитика' });

describe('плашка аналитики', () => {
  it('до выбора показана, «Только необходимое» — номер не создаётся, выбор запоминается', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    const box = await notice();
    await ui.click(within(box).getByRole('button', { name: 'Только необходимое' }));
    expect(screen.queryByRole('region', { name: 'Аналитика' })).toBeNull();
    expect(window.localStorage.getItem('sportpit.analytics')).toBe('no');
    expect(window.localStorage.getItem('sportpit.aid')).toBeNull();
  });

  it('«Принять» создаёт анонимный UUID в sportpit.aid', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ui.click(within(await notice()).getByRole('button', { name: 'Принять' }));
    expect(window.localStorage.getItem('sportpit.analytics')).toBe('yes');
    expect(window.localStorage.getItem('sportpit.aid')).toMatch(UUID);
  });

  it('после выбора плашка при новом заходе не появляется', async () => {
    window.localStorage.setItem('sportpit.analytics', 'no');
    serve();
    open('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Аналитика' })).toBeNull();
  });
});

describe('просмотр и источник', () => {
  it('landing_view уходит один раз и несёт источник из адреса, без анонимного номера до согласия', async () => {
    const api = serve();
    open('/?src=gym&ref=hall7');
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(api.callsTo('POST /track')).toHaveLength(1));
    expect(api.callsTo('POST /track')[0]!.body).toEqual({
      kind: 'landing_view',
      attribution: { source: 'gym', ref: 'hall7' },
    });
    expect(api.callsTo('POST /track')[0]!.headers['x-requested-with']).toBe('sportpit');
    expect(window.sessionStorage.getItem('sportpit.src')).toContain('"gym"');
    expect(window.localStorage.getItem('sportpit.src')).toBeNull();
  });

  it('повторное открытие того же адреса в этой вкладке событие не повторяет', async () => {
    const api = serve();
    open('/');
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(api.callsTo('POST /track')).toHaveLength(1));
    // та же вкладка: sessionStorage сохраняется
    cleanup();
    resetSession();
    const again = serve();
    open('/');
    await screen.findByRole('heading', { level: 1 });
    await new Promise((r) => setTimeout(r, 50));
    expect(again.callsTo('POST /track')).toHaveLength(0);
  });

  it('румынскоязычный гость на /: перенос на /ro не считается просмотром, событие одно — за /ro', async () => {
    const api = serve();
    open('/?src=tg', 'ro');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Iubește-te prin fapte',
    );
    await waitFor(() => expect(api.callsTo('POST /track')).toHaveLength(1));
    // даём возможному второму событию время уйти
    await new Promise((r) => setTimeout(r, 50));
    expect(api.callsTo('POST /track')).toHaveLength(1);
    expect(api.callsTo('POST /track')[0]!.body).toEqual({
      kind: 'landing_view',
      attribution: { source: 'tg' },
    });
    // просмотр записан за адресом /ro, а не за / (его гость не видел)
    expect(JSON.parse(window.sessionStorage.getItem('sportpit.lv') ?? '[]')).toEqual(['/ro']);
  });

  it('сбой события не ломает страницу', async () => {
    serve({ 'POST /track': () => apiError(500, 'server_error', 'core.error.generic') });
    open('/ro', 'ro');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Iubește-te prin fapte',
    );
  });
});

describe('страница «Политика и согласия»', () => {
  it('четыре раздела с заглушками [ВПИШИ] и переключатель выбора по аналитике', async () => {
    const ui = userEvent.setup();
    serve();
    open('/legal');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Политика и согласия',
    );
    for (const title of ['Условия', 'Политика конфиденциальности', 'Аналитика', 'Лист ожидания']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy();
    }
    expect(screen.getAllByText('[ВПИШИ]')).toHaveLength(4);
    expect(screen.getByText('Выбор ещё не сделан')).toBeTruthy();

    const choice = screen.getByRole('group', { name: 'Твой выбор' });
    await ui.click(within(choice).getByRole('button', { name: 'Принять' }));
    expect(screen.getByText('Сейчас: принято')).toBeTruthy();
    expect(window.localStorage.getItem('sportpit.aid')).toMatch(UUID);

    await ui.click(within(choice).getByRole('button', { name: 'Только необходимое' }));
    expect(screen.getByText('Сейчас: только необходимое')).toBeTruthy();
    expect(window.localStorage.getItem('sportpit.aid')).toBeNull();
  });

  it('/ro/legal — на румынском; ссылка из подвала ведёт на /legal', async () => {
    serve();
    open('/ro/legal', 'ro');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Politică și acorduri',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Condiții' })).toBeTruthy();
  });

  it('вошедшему клиенту страница открывается внутри приложения, без шапки лендинга', async () => {
    serve({}, true);
    open('/legal');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Политика и согласия',
    );
    await waitFor(() => expect(document.querySelector('.shell__header')).not.toBeNull());
    expect(document.querySelector('.lp-header')).toBeNull();
    expect(document.querySelector('.lp-consent')).toBeNull();
  });
});

describe('вход передаёт источник', () => {
  async function login() {
    const ui = userEvent.setup();
    const api = serve({
      'GET /auth/me': () => ({ body: { user: null } }),
      'POST /auth/otp/request': () => ({
        body: { ok: true, retryAfterSeconds: 60, expiresInSeconds: 300 },
      }),
      'POST /auth/otp/verify': () => ({ body: { user: user() } }),
      'GET /auth/consents': () => ({ body: grantedConsents({ terms: true, privacy: true }) }),
    });
    open('/login');
    const phone = await screen.findByLabelText(/Номер телефона/);
    await ui.clear(phone);
    await ui.type(phone, '+37360123456');
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await ui.type(await screen.findByLabelText(/Код из SMS/), '654321');
    await ui.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(api.callsTo('POST /auth/otp/verify')).toHaveLength(1));
    return api.callsTo('POST /auth/otp/verify')[0]!.body as Record<string, unknown>;
  }

  it('запомненный источник уходит с проверкой кода', async () => {
    captureAttribution('/?src=trainer&ref=ivan');
    expect(await login()).toEqual({
      phone: '+37360123456',
      code: '654321',
      lang: 'ru',
      attribution: { source: 'trainer', ref: 'ivan' },
    });
  });

  it('без источника поле не отправляется (сервер сам запишет «direct»)', async () => {
    expect(await login()).not.toHaveProperty('attribution');
  });
});
