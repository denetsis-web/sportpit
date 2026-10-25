import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError, grantedConsents, installFakeApi, user } from './fakeApi.ts';
import { cleanUp, renderAt } from './render.tsx';

afterEach(cleanUp);

const PHONE = '+37360123456';

const anonymous = { 'GET /auth/me': () => ({ body: { user: null } }) };
const sent = {
  'POST /auth/otp/request': () => ({
    body: { ok: true, retryAfterSeconds: 60, expiresInSeconds: 300 },
  }),
};

async function openLogin(lang: 'ru' | 'ro' = 'ru') {
  const ui = userEvent.setup();
  renderAt('/login', lang);
  const phone = await screen.findByLabelText(lang === 'ru' ? /Номер телефона/ : /Număr de telefon/);
  return { ui, phone: phone as HTMLInputElement };
}

describe('экран входа', () => {
  it('номер вне формата: понятная ошибка на выбранном языке, введённое остаётся в поле, запрос не уходит', async () => {
    const api = installFakeApi({ ...anonymous, ...sent });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, '060123456');
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Введите номер в формате +373XXXXXXXX.',
    );
    expect(phone.value).toBe('060123456');
    expect(phone.getAttribute('aria-invalid')).toBe('true');
    expect(api.callsTo('POST /auth/otp/request')).toHaveLength(0);
  });

  it('то же по-румынски', async () => {
    installFakeApi({ ...anonymous, ...sent });
    const { ui, phone } = await openLogin('ro');
    await ui.clear(phone);
    await ui.type(phone, '123');
    await ui.click(screen.getByRole('button', { name: 'Primește codul' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Introduceți numărul în formatul +373XXXXXXXX.',
    );
    expect(phone.value).toBe('123');
  });

  it('пробелы и скобки в номере не мешают: уходит чистый номер', async () => {
    const api = installFakeApi({ ...anonymous, ...sent });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, '+373 (60) 123-456');
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByLabelText(/Код из SMS/);
    expect(api.callsTo('POST /auth/otp/request')[0]!.body).toEqual({ phone: PHONE });
    expect(api.callsTo('POST /auth/otp/request')[0]!.headers['x-requested-with']).toBe('sportpit');
  });

  it('429: показывает «подождите N сек», номер остаётся', async () => {
    installFakeApi({
      ...anonymous,
      'POST /auth/otp/request': () =>
        apiError(429, 'rate_limited', 'auth.error.rateLimited', { seconds: 40 }),
    });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Код уже запрошен, подождите 40 сек и попробуйте снова.',
    );
    expect(phone.value).toBe(PHONE);
  });

  it('сбой SMS: «Не удалось отправить код, попробуйте ещё раз», можно нажать снова', async () => {
    let attempt = 0;
    const api = installFakeApi({
      ...anonymous,
      'POST /auth/otp/request': () =>
        ++attempt === 1
          ? apiError(502, 'sms_failed', 'auth.error.smsFailed')
          : { body: { ok: true, retryAfterSeconds: 60, expiresInSeconds: 300 } },
    });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Не удалось отправить код, попробуйте ещё раз',
    );
    expect(phone.value).toBe(PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByLabelText(/Код из SMS/);
    expect(api.callsTo('POST /auth/otp/request')).toHaveLength(2);
  });

  it('нет сети: сообщение о связи, номер остаётся', async () => {
    installFakeApi(anonymous);
    const { ui, phone } = await openLogin();
    // fetch для запроса кода падает
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/auth/otp/request')) throw new TypeError('offline');
      return original(input, init);
    }) as typeof fetch;
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Нет связи с сервером');
    expect(phone.value).toBe(PHONE);
  });

  it('неверный код: сообщение с числом попыток на RU и RO, поле кода доступно, номер виден', async () => {
    installFakeApi({
      ...anonymous,
      ...sent,
      'POST /auth/otp/verify': () =>
        apiError(400, 'otp_invalid', 'auth.error.codeWrong', { attemptsLeft: 4 }),
    });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    const code = await screen.findByLabelText(/Код из SMS/);
    expect(screen.getByText(`Мы отправили код на ${PHONE}.`)).toBeTruthy();
    await ui.type(code, '123456');
    await ui.click(screen.getByRole('button', { name: 'Войти' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Неверный код. Осталось попыток: 4.',
    );
    expect((code as HTMLInputElement).value).toBe('123456');
  });

  it('код не из 6 цифр отклоняется на месте', async () => {
    const api = installFakeApi({ ...anonymous, ...sent });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await ui.type(await screen.findByLabelText(/Код из SMS/), '12');
    await ui.click(screen.getByRole('button', { name: 'Войти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Код состоит из 6 цифр.');
    expect(api.callsTo('POST /auth/otp/verify')).toHaveLength(0);
  });

  it('«Изменить номер» возвращает к вводу номера, введённый номер сохраняется', async () => {
    installFakeApi({ ...anonymous, ...sent });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByLabelText(/Код из SMS/);
    await ui.click(screen.getByRole('button', { name: 'Изменить номер' }));
    expect(((await screen.findByLabelText(/Номер телефона/)) as HTMLInputElement).value).toBe(
      PHONE,
    );
  });

  it('успешный вход: уходит номер, код и язык устройства; согласия уже даны — на главную', async () => {
    const api = installFakeApi({
      ...anonymous,
      ...sent,
      'POST /auth/otp/verify': () => ({ body: { user: user() } }),
      'GET /auth/consents': () => ({ body: grantedConsents({ terms: true, privacy: true }) }),
    });
    const { ui, phone } = await openLogin('ro');
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Primește codul' }));
    await ui.type(await screen.findByLabelText(/Codul din SMS/), '654321');
    await ui.click(screen.getByRole('button', { name: 'Intră' }));
    await screen.findByRole('heading', { level: 1, name: 'Bun venit' });
    expect(api.callsTo('POST /auth/otp/verify')[0]!.body).toEqual({
      phone: PHONE,
      code: '654321',
      lang: 'ro',
    });
  });

  it('новому пользователю после входа предлагают согласия', async () => {
    installFakeApi({
      ...anonymous,
      ...sent,
      'POST /auth/otp/verify': () => ({ body: { user: user() } }),
      'GET /auth/consents': () => ({ body: grantedConsents() }),
    });
    const { ui, phone } = await openLogin();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await ui.type(await screen.findByLabelText(/Код из SMS/), '654321');
    await ui.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByRole('heading', { name: 'Согласия' });
  });

  it('вошедший видит аккаунт и может выйти', async () => {
    const api = installFakeApi({
      'GET /auth/me': () => ({ body: { user: user({ role: 'kitchen' }) } }),
      'POST /auth/logout': () => ({ body: { ok: true } }),
    });
    const ui = userEvent.setup();
    renderAt('/login');
    expect(await screen.findByText(`Вы вошли как ${PHONE}`)).toBeTruthy();
    expect(screen.getByText('Роль: кухня')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Выйти' }));
    await waitFor(() => expect(screen.getByLabelText(/Номер телефона/)).toBeTruthy());
    expect(api.callsTo('POST /auth/logout')).toHaveLength(1);
  });

  it('доступность: на обоих шагах нет нарушений axe', async () => {
    installFakeApi({ ...anonymous, ...sent });
    const { ui, phone } = await openLogin();
    expect(await axe(document.body)).toHaveNoViolations();
    await ui.clear(phone);
    await ui.type(phone, PHONE);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByLabelText(/Код из SMS/);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
