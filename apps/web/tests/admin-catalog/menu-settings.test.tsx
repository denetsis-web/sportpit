import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { cleanUp } from '../auth/render.tsx';
import { renderAt } from '../menu/fixtures.tsx';
import { admin, fail, installFake } from './fake.ts';

// формы набираются по символам: при полном прогоне на нагруженной машине 5 секунд мало

afterEach(() => {
  cleanUp();
  vi.useRealTimers();
});

const dish = (id: number, ru: string, active = true) => ({
  id,
  name: { ru, ro: ru },
  composition: { ru: 'с', ro: 'с' },
  calories: 500,
  proteinG: 30,
  fatG: 10,
  carbsG: 50,
  fiberG: 5,
  weightG: 300,
  allergens: [],
  goals: [],
  vegetarian: false,
  shelfLifeHours: 48,
  photoUrl: null,
  active,
});

const day = (date: string, published: boolean, items: unknown[] = []) => ({
  date,
  published,
  publishedAt: published ? '2026-03-10T09:00:00.000Z' : null,
  items,
});

// Часы страницы стоят на 2026-03-10: «завтра» — 11 марта.
const TOMORROW = '2026-03-11';

function mockToday() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-10T09:00:00Z'));
}

describe('админка: меню на дни (R36.1)', () => {
  const dishes = { items: [dish(1, 'Курица'), dish(2, 'Лосось'), dish(3, 'Снято', false)] };

  it('по умолчанию открыт завтрашний день; неактивные блюда в выборе не предлагаются', async () => {
    mockToday();
    const api = installFake({
      ...admin,
      'GET /admin/menu': () => ({ body: { items: [] } }),
      [`GET /admin/menu/${TOMORROW}`]: () => ({ body: day(TOMORROW, false) }),
      'GET /admin/dishes': () => ({ body: dishes }),
    });
    renderAt('/admin/menu');
    expect(await screen.findByText('Меню на 11.03.2026')).toBeTruthy();
    expect(screen.getByText('Черновик: клиенты этот день не видят')).toBeTruthy();
    const select = await screen.findByLabelText('Блюдо');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Выберите блюдо', 'Курица', 'Лосось']);
    expect(api.callsTo('GET /admin/menu')[0]!.query.get('from')).toBe('2026-03-10');
  });

  it('собрать меню, сохранить: на сервер уходят блюда и лимиты числами', async () => {
    mockToday();
    const ui = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = installFake({
      ...admin,
      'GET /admin/menu': () => ({ body: { items: [] } }),
      [`GET /admin/menu/${TOMORROW}`]: () => ({ body: day(TOMORROW, false) }),
      'GET /admin/dishes': () => ({ body: dishes }),
      [`PUT /admin/menu/${TOMORROW}`]: () => ({ body: day(TOMORROW, false) }),
    });
    renderAt('/admin/menu');
    await ui.selectOptions(await screen.findByLabelText('Блюдо'), '2');
    await ui.click(screen.getByRole('button', { name: 'Добавить в меню' }));
    const limit = screen.getByLabelText('Лимит порций');
    await ui.clear(limit);
    await ui.type(limit, '25');
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.callsTo(`PUT /admin/menu/${TOMORROW}`)).toHaveLength(1));
    expect(api.callsTo(`PUT /admin/menu/${TOMORROW}`)[0]!.body).toEqual({
      items: [{ dishId: 2, portionLimit: 25 }],
    });
    expect(await screen.findByText('Меню сохранено.')).toBeTruthy();
  });

  it('публикация: сначала сохраняется состав, потом публикация; пустое меню опубликовать нельзя', async () => {
    mockToday();
    const ui = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const order: string[] = [];
    installFake({
      ...admin,
      'GET /admin/menu': () => ({ body: { items: [] } }),
      [`GET /admin/menu/${TOMORROW}`]: () => ({ body: day(TOMORROW, false) }),
      'GET /admin/dishes': () => ({ body: dishes }),
      [`PUT /admin/menu/${TOMORROW}`]: () => {
        order.push('save');
        return { body: day(TOMORROW, false) };
      },
      [`POST /admin/menu/${TOMORROW}/publish`]: () => {
        order.push('publish');
        return { body: day(TOMORROW, true) };
      },
    });
    renderAt('/admin/menu');
    const publish = await screen.findByRole('button', { name: 'Опубликовать меню' });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    await ui.selectOptions(screen.getByLabelText('Блюдо'), '1');
    await ui.click(screen.getByRole('button', { name: 'Добавить в меню' }));
    await ui.click(screen.getByRole('button', { name: 'Опубликовать меню' }));
    expect(await screen.findByText('Меню опубликовано.')).toBeTruthy();
    expect(order).toEqual(['save', 'publish']);
  });

  it('сервер не даёт снять занятые порции: текст ошибки виден, состав в форме остаётся', async () => {
    mockToday();
    const ui = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    installFake({
      ...admin,
      'GET /admin/menu': () => ({ body: { items: [] } }),
      [`GET /admin/menu/${TOMORROW}`]: () => ({
        body: day(TOMORROW, true, [{ dishId: 1, portionLimit: 10, reserved: 6 }]),
      }),
      'GET /admin/dishes': () => ({ body: dishes }),
      [`PUT /admin/menu/${TOMORROW}`]: () =>
        fail(409, 'portions_reserved', 'catalog.error.portionsReserved', undefined, {
          reserved: 6,
        }),
    });
    renderAt('/admin/menu');
    expect(await screen.findByText('Заказано порций: 6')).toBeTruthy();
    expect(screen.getByText('Опубликовано: клиенты видят этот день')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Убрать из меню: Курица' }));
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect((await screen.findByRole('alert')).textContent).toContain('уже заказана (6)');
  });

  it('копирование: состав берётся с выбранной даты и появляется в черновике', async () => {
    mockToday();
    const ui = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let copied = false;
    const api = installFake({
      ...admin,
      'GET /admin/menu': () => ({ body: { items: [] } }),
      [`GET /admin/menu/${TOMORROW}`]: () => ({
        body: day(TOMORROW, false, copied ? [{ dishId: 1, portionLimit: 7, reserved: 0 }] : []),
      }),
      'GET /admin/dishes': () => ({ body: dishes }),
      [`POST /admin/menu/${TOMORROW}/copy`]: () => {
        copied = true;
        return { body: day(TOMORROW, false) };
      },
    });
    renderAt('/admin/menu');
    const from = await screen.findByLabelText('Скопировать состав с даты');
    expect((from as HTMLInputElement).value).toBe('2026-03-10');
    await ui.click(screen.getByRole('button', { name: 'Скопировать' }));
    await waitFor(() => expect(api.callsTo(`POST /admin/menu/${TOMORROW}/copy`)).toHaveLength(1));
    expect(api.callsTo(`POST /admin/menu/${TOMORROW}/copy`)[0]!.body).toEqual({
      fromDate: '2026-03-10',
    });
    expect(await screen.findByDisplayValue('7')).toBeTruthy();
  });

  it('нет автоматических нарушений доступности', async () => {
    mockToday();
    installFake({
      ...admin,
      'GET /admin/menu': () => ({
        body: { items: [{ date: TOMORROW, published: true, itemCount: 1 }] },
      }),
      [`GET /admin/menu/${TOMORROW}`]: () => ({
        body: day(TOMORROW, false, [{ dishId: 1, portionLimit: 10, reserved: 0 }]),
      }),
      'GET /admin/dishes': () => ({ body: dishes }),
    });
    const { container } = renderAt('/admin/menu');
    await screen.findByText('Меню на 11.03.2026');
    await screen.findByDisplayValue('10');
    expect(await axe(container)).toHaveNoViolations();
  });
});

const settings = {
  maxBoxesPerDay: 3,
  toleranceNote: {
    ru: 'Допуск КБЖУ: ±5% по белку',
    ro: 'Toleranță valori nutriționale: ±5% la proteine',
  },
  stockBufferPercent: 0,
  labelSize: '70x50',
  supportContacts: { phone: '[ВПИШИ]', email: '[ВПИШИ]', messenger: '[ВПИШИ]' },
};

describe('админка: настройки и журнал (R43, R03, R32.2, R33, R30.1, R55)', () => {
  const audit = {
    items: [
      {
        id: 2,
        userId: 1,
        action: 'settings.update',
        target: 'setting:maxBoxesPerDay',
        detail: { value: 4 },
        createdAt: '2026-03-10T09:05:00.000Z',
      },
      {
        id: 1,
        userId: null,
        action: 'system.cleanup',
        target: 'jobs',
        detail: null,
        createdAt: '2026-03-10T09:00:00.000Z',
      },
    ],
    total: 2,
  };

  it('форма показывает текущие значения и подсказку «впишите» у контактов-заглушек', async () => {
    installFake({
      ...admin,
      'GET /admin/settings': () => ({ body: settings }),
      'GET /admin/audit': () => ({ body: audit }),
    });
    renderAt('/admin/settings');
    expect(
      ((await screen.findByLabelText('Максимум боксов в день на клиента')) as HTMLInputElement)
        .value,
    ).toBe('3');
    expect((screen.getByLabelText('Запас на брак, %') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Размер этикетки, мм') as HTMLInputElement).value).toBe('70x50');
    expect((screen.getByLabelText('Телефон') as HTMLInputElement).value).toBe('[ВПИШИ]');
    expect(screen.getAllByText('Впишите настоящий контакт вместо пометки [ВПИШИ].')).toHaveLength(
      3,
    );
  });

  it('сохранение отправляет все настройки одним запросом и обновляет журнал', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/settings': () => ({ body: settings }),
      'GET /admin/audit': () => ({ body: audit }),
      'PUT /admin/settings': (req) => ({ body: { ...settings, ...(req.body as object) } }),
    });
    renderAt('/admin/settings');
    const max = await screen.findByLabelText('Максимум боксов в день на клиента');
    await ui.clear(max);
    await ui.type(max, '5');
    const buffer = screen.getByLabelText('Запас на брак, %');
    await ui.clear(buffer);
    await ui.type(buffer, '8');
    await ui.clear(screen.getByLabelText('Размер этикетки, мм'));
    await ui.type(screen.getByLabelText('Размер этикетки, мм'), '100x70');
    await ui.clear(screen.getByLabelText('Телефон'));
    await ui.type(screen.getByLabelText('Телефон'), '+37300000000');
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.callsTo('PUT /admin/settings')).toHaveLength(1));
    expect(api.callsTo('PUT /admin/settings')[0]!.body).toEqual({
      maxBoxesPerDay: 5,
      stockBufferPercent: 8,
      labelSize: '100x70',
      toleranceNote: settings.toleranceNote,
      supportContacts: { phone: '+37300000000', email: '[ВПИШИ]', messenger: '[ВПИШИ]' },
    });
    expect(await screen.findByText('Настройки сохранены.')).toBeTruthy();
    await waitFor(() => expect(api.callsTo('GET /admin/audit').length).toBe(2));
  });

  it('ошибки полей от сервера — у своих полей, в том числе вложенных', async () => {
    const ui = userEvent.setup();
    installFake({
      ...admin,
      'GET /admin/settings': () => ({ body: settings }),
      'GET /admin/audit': () => ({ body: audit }),
      'PUT /admin/settings': () =>
        fail(400, 'validation_failed', 'core.error.validation', {
          stockBufferPercent: 'admin.error.percent',
          'supportContacts.phone': 'admin.error.text',
        }),
    });
    renderAt('/admin/settings');
    await ui.click(await screen.findByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.getAllByText('Укажите процент от 0 до 100.').length).toBe(1));
    expect(screen.getByText('Поле обязательно, не длиннее допустимого.')).toBeTruthy();
    expect(screen.getByLabelText('Запас на брак, %').getAttribute('aria-invalid')).toBe('true');
  });

  it('журнал действий: время, автор, действие и объект; записи системы без автора', async () => {
    installFake({
      ...admin,
      'GET /admin/settings': () => ({ body: settings }),
      'GET /admin/audit': () => ({ body: audit }),
    });
    renderAt('/admin/settings');
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('settings.update')).toBeTruthy();
    expect(within(rows[1]!).getByText('setting:maxBoxesPerDay')).toBeTruthy();
    expect(within(rows[1]!).getByText('10.03.2026 11:05')).toBeTruthy();
    expect(within(rows[2]!).getByText('система')).toBeTruthy();
  });

  it('нет автоматических нарушений доступности', async () => {
    installFake({
      ...admin,
      'GET /admin/settings': () => ({ body: settings }),
      'GET /admin/audit': () => ({ body: audit }),
    });
    const { container } = renderAt('/admin/settings');
    await screen.findByRole('table');
    expect(await axe(container)).toHaveNoViolations();
  });
});
