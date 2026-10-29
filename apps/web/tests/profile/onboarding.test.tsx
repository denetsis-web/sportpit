import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError, grantedConsents, installFakeApi, user } from '../auth/fakeApi.ts';
import { cleanUp } from '../auth/render.tsx';
import { renderAt, SAMPLE_PROFILE, SAMPLE_TARGETS } from './render.tsx';

afterEach(cleanUp);

const me = { 'GET /auth/me': () => ({ body: { user: user() } }) };
const empty = (healthConsent: boolean) => ({
  'GET /profile': () => ({ body: { profile: null, targets: null, healthConsent } }),
});
const consents = (granted: boolean) => ({
  'GET /auth/consents': () => ({ body: grantedConsents({ health_data: granted }) }),
});

type Ui = ReturnType<typeof userEvent.setup>;

/** Заполняет анкету: мужчина 30 лет, 180 см, 80 кг, похудение, умеренная. */
async function fillForm(ui: Ui, lang: 'ru' | 'ro' = 'ru') {
  const l =
    lang === 'ru'
      ? {
          sex: 'Мужской',
          age: 'Возраст, лет',
          height: 'Рост, см',
          weight: 'Вес, кг',
          goal: 'Цель',
          activity: 'Активность',
          lose: 'Похудение',
          moderate: 'Умеренная: 3–5 тренировок в неделю',
        }
      : {
          sex: 'Masculin',
          age: 'Vârsta, ani',
          height: 'Înălțimea, cm',
          weight: 'Greutatea, kg',
          goal: 'Obiectiv',
          activity: 'Activitate',
          lose: 'Slăbire',
          moderate: 'Moderată: 3–5 antrenamente pe săptămână',
        };
  await ui.click(await screen.findByLabelText(l.sex));
  await ui.type(screen.getByLabelText(l.age), '30');
  await ui.type(screen.getByLabelText(l.height), '180');
  await ui.type(screen.getByLabelText(l.weight), '80');
  await ui.selectOptions(screen.getByLabelText(l.goal), l.lose);
  await ui.selectOptions(screen.getByLabelText(l.activity), l.moderate);
}

describe('анкета цели', () => {
  it('без согласия на данные о здоровье: сначала отдельная галочка, отказ не мешает посчитать, но на сервер параметры не уходят', async () => {
    const api = installFakeApi({
      ...me,
      ...empty(false),
      ...consents(false),
      'POST /auth/consents': () => ({ body: grantedConsents() }),
    });
    const ui = userEvent.setup();
    renderAt('/onboarding');

    // шаг 1: единственная галочка — здоровье; остальных согласий здесь нет
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(api.callsTo('POST /auth/consents')[0]!.body).toEqual({
      changes: [{ kind: 'health_data', granted: false, version: '2026-10-25' }],
    });

    await fillForm(ui);
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));

    // эталон, посчитанный вручную: 2345 ккал, 160/65/280, клетчатка 33
    expect(await screen.findByText('2345 ккал')).toBeTruthy();
    expect(screen.getByText('160 г')).toBeTruthy();
    expect(screen.getByText('65 г')).toBeTruthy();
    expect(screen.getByText('280 г')).toBeTruthy();
    expect(screen.getByText('33 г')).toBeTruthy();
    expect(screen.getByText(/Диапазон белка 1,6–2,2 г на кг массы тела: 128–176 г/)).toBeTruthy();
    expect(screen.getByText(/Это не медицинская рекомендация/)).toBeTruthy();
    expect(
      screen.getByText('Параметры не сохранены: нет согласия на данные о здоровье.'),
    ).toBeTruthy();
    expect(api.callsTo('PUT /profile')).toHaveLength(0);
  });

  it('с согласием: галочка уходит на сервер, анкета сохраняется, показана норма сервера', async () => {
    const api = installFakeApi({
      ...me,
      ...empty(false),
      ...consents(false),
      'POST /auth/consents': () => ({ body: grantedConsents({ health_data: true }) }),
      'PUT /profile': () => ({
        body: { profile: SAMPLE_PROFILE, targets: SAMPLE_TARGETS, healthConsent: true },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/onboarding');
    await ui.click(await screen.findByRole('checkbox'));
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(api.callsTo('POST /auth/consents')[0]!.body).toEqual({
      changes: [{ kind: 'health_data', granted: true, version: '2026-10-25' }],
    });

    await fillForm(ui);
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));
    expect(await screen.findByText('2345 ккал')).toBeTruthy();
    expect(screen.getByText('Анкета сохранена.')).toBeTruthy();
    expect(api.callsTo('PUT /profile')[0]!.body).toEqual({
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      goal: 'lose',
      activity: 'moderate',
      hasCondition: false,
    });
  });

  it('согласие уже есть: сразу форма; сервер вернул 403 — ошибка видна, нормы нет', async () => {
    installFakeApi({
      ...me,
      ...empty(true),
      'PUT /profile': () => apiError(403, 'consent_required', 'auth.error.consentRequired'),
    });
    const ui = userEvent.setup();
    renderAt('/onboarding');
    await fillForm(ui);
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Нужно ваше согласие. Отметьте его и повторите.',
    );
    expect(screen.queryByText('2345 ккал')).toBeNull();
  });

  it('состояние здоровья: вместо нормы «Обратитесь к врачу», цифр нет, ссылка на меню остаётся', async () => {
    installFakeApi({
      ...me,
      ...empty(true),
      'PUT /profile': () => ({
        body: {
          profile: { ...SAMPLE_PROFILE, hasCondition: true },
          targets: { blocked: 'medical_condition' },
          healthConsent: true,
        },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/onboarding');
    await fillForm(ui);
    await ui.click(screen.getByLabelText(/диабет, беременность/));
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));
    expect(await screen.findByRole('heading', { name: 'Обратитесь к врачу' })).toBeTruthy();
    expect(screen.getByText('Меню и заказ боксов остаются доступны.')).toBeTruthy();
    expect(screen.getByText(/Это не медицинская рекомендация/)).toBeTruthy();
    expect(screen.queryByText(/ккал/)).toBeNull();
    expect(screen.getByRole('link', { name: 'К меню' }).getAttribute('href')).toBe('/');
  });

  it('возраст 17 без согласия: расчёт на месте тоже даёт «Обратитесь к врачу», на сервер ничего не уходит', async () => {
    const api = installFakeApi({
      ...me,
      ...empty(false),
      ...consents(false),
      'POST /auth/consents': () => ({ body: grantedConsents() }),
    });
    const ui = userEvent.setup();
    renderAt('/onboarding');
    await ui.click(await screen.findByRole('button', { name: 'Продолжить' }));
    await fillForm(ui);
    const age = screen.getByLabelText('Возраст, лет') as HTMLInputElement;
    await ui.clear(age);
    await ui.type(age, '17');
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));
    expect(await screen.findByRole('heading', { name: 'Обратитесь к врачу' })).toBeTruthy();
    expect(screen.queryByText(/ккал/)).toBeNull();
    expect(api.callsTo('PUT /profile')).toHaveLength(0);
  });

  it('минимум безопасного уровня: пометка рядом с нормой', async () => {
    installFakeApi({
      ...me,
      ...empty(true),
      'PUT /profile': () => ({
        body: {
          profile: { ...SAMPLE_PROFILE, sex: 'female' },
          targets: { ...SAMPLE_TARGETS, kcal: 1200, floorApplied: true },
          healthConsent: true,
        },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/onboarding');
    await fillForm(ui);
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));
    expect(await screen.findByText(/Минимум безопасного уровня/)).toBeTruthy();
    expect(screen.getByText('1200 ккал')).toBeTruthy();
  });

  it('пустая и неверная анкета: ошибки у полей, запрос не уходит', async () => {
    const api = installFakeApi({ ...me, ...empty(true) });
    const ui = userEvent.setup();
    renderAt('/onboarding');
    await ui.click(await screen.findByRole('button', { name: 'Рассчитать норму' }));
    expect((await screen.findAllByText('Заполните поле.')).length).toBeGreaterThanOrEqual(5);

    await ui.type(screen.getByLabelText('Возраст, лет'), '5');
    await ui.type(screen.getByLabelText('Вес, кг'), '72,5');
    await ui.click(screen.getByRole('button', { name: 'Рассчитать норму' }));
    expect(screen.getByText('Введите число от 10 до 110.')).toBeTruthy();
    expect(screen.getByLabelText('Возраст, лет').getAttribute('aria-invalid')).toBe('true');
    // дробный вес допустим: на нём ошибки нет
    expect(screen.getByLabelText('Вес, кг').getAttribute('aria-invalid')).toBeNull();
    expect(api.callsTo('PUT /profile')).toHaveLength(0);
  });

  it('анкету можно пропустить: ссылка ведёт в меню, запросов на сохранение нет; сохранённая анкета подставляется для правки', async () => {
    const api = installFakeApi({ ...me, ...empty(true) });
    renderAt('/onboarding');
    const skip = await screen.findByRole('link', { name: 'Пропустить' });
    expect(skip.getAttribute('href')).toBe('/');
    expect(api.callsTo('PUT /profile')).toHaveLength(0);
  });

  it('при правке поля заполнены сохранёнными значениями', async () => {
    installFakeApi({
      ...me,
      'GET /profile': () => ({
        body: { profile: SAMPLE_PROFILE, targets: SAMPLE_TARGETS, healthConsent: true },
      }),
    });
    renderAt('/onboarding');
    expect(((await screen.findByLabelText('Возраст, лет')) as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Мужской') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Цель') as HTMLSelectElement).value).toBe('lose');
  });

  it('без входа ведёт на экран входа', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderAt('/onboarding');
    expect(await screen.findByLabelText(/Номер телефона/)).toBeTruthy();
  });

  it('румынский интерфейс и доступность', async () => {
    installFakeApi({ ...me, ...empty(true) });
    const ui = userEvent.setup();
    renderAt('/onboarding', 'ro');
    await fillForm(ui, 'ro');
    expect(screen.getByRole('button', { name: 'Calculează necesarul' })).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
    await waitFor(() => expect(document.documentElement.lang).toBe('ro'));
  });
});
