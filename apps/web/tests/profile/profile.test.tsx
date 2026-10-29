import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError, grantedConsents, installFakeApi, user } from '../auth/fakeApi.ts';
import { cleanUp } from '../auth/render.tsx';
import { renderAt, SAMPLE_PROFILE, SAMPLE_TARGETS } from './render.tsx';

afterEach(cleanUp);

const OLD = '+37360123456';
const NEW = '+37369111222';

const base = (overrides: Record<string, () => { status?: number; body?: unknown }> = {}) => ({
  'GET /auth/me': () => ({ body: { user: user({ phone: OLD }) } }),
  'GET /profile': () => ({
    body: { profile: SAMPLE_PROFILE, targets: SAMPLE_TARGETS, healthConsent: true },
  }),
  'GET /auth/consents': () => ({
    body: grantedConsents({ terms: true, privacy: true, health_data: true }),
  }),
  'PATCH /auth/me': () => ({ body: { user: user({ lang: 'ro' }) } }),
  ...overrides,
});

describe('профиль: данные цели', () => {
  it('показывает данные цели и норму с дисклеймером; ссылка на анкету', async () => {
    installFakeApi(base());
    renderAt('/profile');
    expect(await screen.findByText('Мужской, 30 лет, 180 см, 80 кг')).toBeTruthy();
    expect(screen.getByText('2345 ккал')).toBeTruthy();
    expect(screen.getByText(/Это не медицинская рекомендация/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Изменить анкету' }).getAttribute('href')).toBe(
      '/onboarding',
    );
  });

  it('анкеты нет: приглашение заполнить (вернуться к ней можно из профиля)', async () => {
    installFakeApi(
      base({
        'GET /profile': () => ({ body: { profile: null, targets: null, healthConsent: false } }),
      }),
    );
    renderAt('/profile');
    expect(await screen.findByText('Анкета не заполнена.')).toBeTruthy();
    expect(screen.getByText(/нужно согласие на данные о здоровье/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Заполнить анкету' }).getAttribute('href')).toBe(
      '/onboarding',
    );
  });

  it('состояние здоровья: «Обратитесь к врачу» вместо нормы', async () => {
    installFakeApi(
      base({
        'GET /profile': () => ({
          body: {
            profile: { ...SAMPLE_PROFILE, hasCondition: true },
            targets: { blocked: 'medical_condition' },
            healthConsent: true,
          },
        }),
      }),
    );
    renderAt('/profile');
    expect(await screen.findByRole('heading', { name: 'Обратитесь к врачу' })).toBeTruthy();
    expect(screen.queryByText('2345 ккал')).toBeNull();
  });
});

describe('профиль: язык', () => {
  it('смена языка переключает интерфейс и сохраняется в профиле (PATCH /auth/me)', async () => {
    const api = installFakeApi(base());
    const ui = userEvent.setup();
    renderAt('/profile');
    await screen.findByText('Мужской, 30 лет, 180 см, 80 кг');
    await ui.click(screen.getByRole('button', { name: 'Română' }));
    expect(await screen.findByRole('heading', { name: 'Limba' })).toBeTruthy();
    await waitFor(() => expect(api.callsTo('PATCH /auth/me')).toHaveLength(1));
    expect(api.callsTo('PATCH /auth/me')[0]!.body).toEqual({ lang: 'ro' });
  });
});

describe('профиль: смена телефона', () => {
  it('код запрашивается на новый номер, номер меняется только после ввода кода', async () => {
    const api = installFakeApi(
      base({
        'POST /profile/phone/request': () => ({
          body: { ok: true, retryAfterSeconds: 60, expiresInSeconds: 300 },
        }),
        'POST /profile/phone': () => ({ body: { user: user({ phone: NEW }) } }),
      }),
    );
    const ui = userEvent.setup();
    renderAt('/profile');
    expect(await screen.findByText(`Текущий номер: ${OLD}`)).toBeTruthy();

    await ui.click(screen.getByRole('button', { name: 'Изменить номер' }));
    const phone = screen.getByLabelText('Новый номер');
    await ui.clear(phone);
    await ui.type(phone, '+373 (69) 111-222');
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    expect(api.callsTo('POST /profile/phone/request')[0]!.body).toEqual({ phone: NEW });

    // пока код не введён, номер прежний и запроса подтверждения нет
    expect(api.callsTo('POST /profile/phone')).toHaveLength(0);
    expect(screen.queryByText(`Текущий номер: ${NEW}`)).toBeNull();

    await ui.type(await screen.findByLabelText('Код из SMS'), '123456');
    await ui.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText(`Текущий номер: ${NEW}`)).toBeTruthy();
    expect(screen.getByText(`Номер изменён: ${NEW}.`)).toBeTruthy();
    expect(api.callsTo('POST /profile/phone')[0]!.body).toEqual({ phone: NEW, code: '123456' });
  });

  it('неверный номер не отправляется; неверный код и занятый номер показывают ошибку, номер прежний', async () => {
    const api = installFakeApi(
      base({
        'POST /profile/phone/request': () => ({
          body: { ok: true, retryAfterSeconds: 60, expiresInSeconds: 300 },
        }),
        'POST /profile/phone': () => apiError(409, 'phone_taken', 'auth.error.phoneTaken'),
      }),
    );
    const ui = userEvent.setup();
    renderAt('/profile');
    await ui.click(await screen.findByRole('button', { name: 'Изменить номер' }));
    const phone = screen.getByLabelText('Новый номер');
    await ui.clear(phone);
    await ui.type(phone, '123');
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Введите номер в формате +373XXXXXXXX.',
    );
    expect(api.callsTo('POST /profile/phone/request')).toHaveLength(0);

    await ui.clear(phone);
    await ui.type(phone, NEW);
    await ui.click(screen.getByRole('button', { name: 'Получить код' }));
    await ui.type(await screen.findByLabelText('Код из SMS'), '654321');
    await ui.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Этот номер уже занят другим аккаунтом.',
    );
    expect(screen.getByText(`Текущий номер: ${OLD}`)).toBeTruthy();
  });
});

describe('профиль: согласия', () => {
  it('показывает три согласия отдельными галочками; отзыв здоровья уходит на сервер и анкета перечитывается', async () => {
    let revoked = false;
    const api = installFakeApi(
      base({
        'GET /profile': () => ({
          body: revoked
            ? { profile: null, targets: null, healthConsent: false }
            : { profile: SAMPLE_PROFILE, targets: SAMPLE_TARGETS, healthConsent: true },
        }),
        'POST /auth/consents': () => {
          revoked = true;
          return { body: grantedConsents({ terms: true, privacy: true }) };
        },
      }),
    );
    const ui = userEvent.setup();
    renderAt('/profile');
    const health = await screen.findByLabelText(/отдельное согласие на обработку данных/);
    expect((health as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await ui.click(health);
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findByText(/Согласие на данные о здоровье отозвано/)).toBeTruthy();
    expect(api.callsTo('POST /auth/consents')[0]!.body).toEqual({
      changes: [
        { kind: 'terms', granted: true, version: '2026-10-25' },
        { kind: 'privacy', granted: true, version: '2026-10-25' },
        { kind: 'health_data', granted: false, version: '2026-10-25' },
      ],
    });
    expect(await screen.findByText('Анкета не заполнена.')).toBeTruthy();
    expect(screen.queryByText('2345 ккал')).toBeNull();
  });
});

describe('профиль: выгрузка данных', () => {
  it('кнопка скачивает JSON с данными, полученными с сервера', async () => {
    const payload = { user: { id: 1 }, profile: null, consents: [], data: { orders: [] } };
    const api = installFakeApi(base({ 'GET /profile/export': () => ({ body: payload }) }));
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    const ui = userEvent.setup();
    renderAt('/profile');
    await ui.click(await screen.findByRole('button', { name: 'Выгрузить данные' }));
    expect(await screen.findByText('Файл подготовлен.')).toBeTruthy();
    expect(api.callsTo('GET /profile/export')).toHaveLength(1);
    expect(clicked).toEqual(['sportpit-moi-dannye.json']);
    expect(JSON.parse(await blobs[0]!.text())).toEqual(payload);
    click.mockRestore();
  });
});

describe('профиль: удаление аккаунта', () => {
  it('без подтверждения запрос не уходит; отмена оставляет аккаунт', async () => {
    const api = installFakeApi(base());
    const ui = userEvent.setup();
    renderAt('/profile');
    await ui.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    const dialog = await screen.findByRole('dialog', { name: 'Удалить аккаунт?' });
    expect(dialog.textContent).toContain(
      'Повторный вход по этому номеру создаст новый пустой аккаунт',
    );
    expect(api.callsTo('POST /profile/account/delete')).toHaveLength(0);
    await ui.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo('POST /profile/account/delete')).toHaveLength(0);
  });

  it('подтверждение: уходит confirm=true, сессия на клиенте закрывается', async () => {
    const api = installFakeApi(
      base({ 'POST /profile/account/delete': () => ({ body: { ok: true } }) }),
    );
    const ui = userEvent.setup();
    renderAt('/profile');
    await ui.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    await ui.click(await screen.findByRole('button', { name: 'Да, удалить' }));
    await waitFor(() => expect(api.callsTo('POST /profile/account/delete')).toHaveLength(1));
    expect(api.callsTo('POST /profile/account/delete')[0]!.body).toEqual({ confirm: true });
    // после удаления клиент уже не вошёл: его ждёт экран входа
    expect(await screen.findByLabelText(/Номер телефона/)).toBeTruthy();
  });

  it('ошибка удаления видна в окне, окно остаётся', async () => {
    installFakeApi(
      base({
        'POST /profile/account/delete': () =>
          apiError(400, 'confirm_required', 'profile.error.confirmRequired'),
      }),
    );
    const ui = userEvent.setup();
    renderAt('/profile');
    await ui.click(await screen.findByRole('button', { name: 'Удалить аккаунт' }));
    await ui.click(await screen.findByRole('button', { name: 'Да, удалить' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Подтвердите удаление аккаунта.');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('профиль: прочее', () => {
  it('без входа — экран входа', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderAt('/profile');
    expect(await screen.findByLabelText(/Номер телефона/)).toBeTruthy();
  });

  it('румынский интерфейс и доступность', async () => {
    installFakeApi(base());
    renderAt('/profile', 'ro');
    expect(await screen.findByRole('heading', { name: 'Datele obiectivului' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Șterge contul' })).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('русский интерфейс: доступность', async () => {
    installFakeApi(base());
    renderAt('/profile');
    await screen.findByText('2345 ккал');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
