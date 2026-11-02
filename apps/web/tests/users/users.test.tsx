import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { nav } from '../../src/features/admin/users/routes.tsx';
import { filterNavByRole } from '../../src/features/admin/shell/menu.ts';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { cleanUp } from '../auth/render.tsx';
import { admin, adminUser, fail, installFake } from '../admin-catalog/fake.ts';
import { renderApp } from '../helpers.tsx';

// экран «Пользователи» администратора: роли и холодильники операторов (R03, R46)

const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,users}/routes.tsx'],
  { eager: true },
);

function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules: {}, adminModules }, { lang });
}

afterEach(() => {
  cleanUp();
  vi.restoreAllMocks();
});

const person = (over: Record<string, unknown> = {}) => ({
  id: 2,
  phone: '+37360000002',
  role: 'client',
  lang: 'ru',
  fridgeIds: [] as string[],
  ...over,
});

const fridge = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  gymId: 'gym-1',
  gymName: 'Атлант',
  gymSharePercent: 10,
  name,
  capacityBoxes: 40,
  cutoffTime: '18:00',
  pickupFrom: '07:00',
  pickupTo: '22:00',
  accessCode: null,
  active: true,
  ...over,
});

const FRIDGES = [fridge('fr-1', 'У входа'), fridge('fr-2', 'У бассейна')];

function baseRoutes(items: unknown[], extra: Parameters<typeof installFake>[0] = {}) {
  return {
    ...admin,
    'GET /auth/users': () => ({ body: { items } }),
    'GET /admin/fridges': () => ({ body: { items: FRIDGES } }),
    ...extra,
  };
}

describe('админка: пункт меню «Пользователи»', () => {
  it('виден только администратору и подписан в словаре users', () => {
    expect(nav).toHaveLength(1);
    expect(nav[0]!.to).toBe('/admin/users');
    expect(nav[0]!.labelKey).toBe('users.nav.users');
    expect(filterNavByRole(nav, 'admin')).toHaveLength(1);
    for (const role of ['kitchen', 'operator', 'client'] as const) {
      expect(filterNavByRole(nav, role), role).toEqual([]);
    }
  });
});

describe('админка: список пользователей', () => {
  it('показывает телефон и роль каждого; выбор холодильников есть только у оператора', async () => {
    installFake(
      baseRoutes([
        { ...adminUser(), id: 1 },
        person({ id: 2, role: 'operator', fridgeIds: ['fr-1'] }),
        person({ id: 3, phone: '+37360000003', role: 'kitchen' }),
      ]),
    );
    renderAt('/admin/users');
    expect(await screen.findByText('+37360000002')).toBeTruthy();
    expect(screen.getByText('+37360000003')).toBeTruthy();
    expect(screen.getByLabelText('Роль: +37360000002')).toHaveProperty('value', 'operator');
    expect(screen.getByLabelText('Роль: +37360000003')).toHaveProperty('value', 'kitchen');
    // холодильники — только у оператора, отмечен его холодильник
    const group = screen.getByRole('group', { name: 'Холодильники оператора +37360000002' });
    expect(
      (within(group).getByRole('checkbox', { name: /У входа/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(group).getByRole('checkbox', { name: /У бассейна/ }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(screen.queryByRole('group', { name: /\+37360000003/ })).toBeNull();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('клиент не видит страницу: «Нет доступа» и ни одного запроса списка', async () => {
    const api = installFake({
      'GET /auth/me': () => ({ body: { user: adminUser('client') } }),
      'GET /auth/users': () => ({ body: { items: [] } }),
    });
    renderAt('/admin/users');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(api.callsTo('GET /auth/users')).toHaveLength(0);
  });
});

describe('смена роли', () => {
  it('просит подтверждение; «Отмена» ничего не отправляет, «Сменить роль» шлёт PUT и обновляет список', async () => {
    const ui = userEvent.setup();
    let current = person();
    const api = installFake(
      baseRoutes([], {
        'GET /auth/users': () => ({ body: { items: [current] } }),
        'PUT /auth/users/2/role': (req) => {
          current = person({ role: (req.body as { role: string }).role });
          return { body: { user: current } };
        },
      }),
    );
    renderAt('/admin/users');
    const select = await screen.findByLabelText('Роль: +37360000002');

    await ui.selectOptions(select, 'kitchen');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/клиент → кухня/)).toBeTruthy();
    await ui.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(api.callsTo('PUT /auth/users/2/role')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Роль: +37360000002')).toHaveProperty('value', 'client');

    await ui.selectOptions(screen.getByLabelText('Роль: +37360000002'), 'kitchen');
    await ui.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Сменить роль' }),
    );
    await waitFor(() => expect(api.callsTo('PUT /auth/users/2/role')).toHaveLength(1));
    expect(api.callsTo('PUT /auth/users/2/role')[0]!.body).toEqual({ role: 'kitchen' });
    await waitFor(() =>
      expect(screen.getByLabelText('Роль: +37360000002')).toHaveProperty('value', 'kitchen'),
    );
    expect(screen.getByText('Роль изменена.')).toBeTruthy();
  });

  it('ошибка «нельзя менять свою роль» показывается текстом на русском, роль в списке не меняется', async () => {
    const ui = userEvent.setup();
    installFake(
      baseRoutes([{ ...adminUser(), id: 1, role: 'admin' }], {
        'PUT /auth/users/1/role': () => fail(400, 'own_role', 'auth.error.ownRole'),
      }),
    );
    renderAt('/admin/users');
    await ui.selectOptions(await screen.findByLabelText('Роль: +37360123456'), 'client');
    await ui.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Сменить роль' }),
    );
    expect(
      await screen.findByText('Свою роль менять нельзя: попросите другого администратора.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Роль: +37360123456')).toHaveProperty('value', 'admin');
  });

  it('ошибка «последний администратор» — на румынском при языке ro', async () => {
    const ui = userEvent.setup();
    installFake(
      baseRoutes([person({ id: 2, role: 'admin' })], {
        'PUT /auth/users/2/role': () => fail(409, 'last_admin', 'auth.error.lastAdmin'),
      }),
    );
    renderAt('/admin/users', 'ro');
    const select = await screen.findByLabelText('Rol: +37360000002');
    await ui.selectOptions(select, 'client');
    const dialog = await screen.findByRole('dialog');
    await ui.click(within(dialog).getAllByRole('button')[0]!);
    expect(await screen.findByText(/ultimul administrator/)).toBeTruthy();
  });
});

describe('холодильники оператора', () => {
  it('отмеченные холодильники уходят одним PUT со списком идентификаторов', async () => {
    const ui = userEvent.setup();
    let current = person({ role: 'operator', fridgeIds: ['fr-1'] });
    const api = installFake(
      baseRoutes([], {
        'GET /auth/users': () => ({ body: { items: [current] } }),
        'PUT /auth/users/2/fridges': (req) => {
          current = person({
            role: 'operator',
            fridgeIds: (req.body as { fridgeIds: string[] }).fridgeIds,
          });
          return { body: { user: current } };
        },
      }),
    );
    renderAt('/admin/users');
    const group = await screen.findByRole('group', {
      name: 'Холодильники оператора +37360000002',
    });
    await ui.click(within(group).getByRole('checkbox', { name: /У бассейна/ }));
    await ui.click(screen.getByRole('button', { name: 'Сохранить холодильники: +37360000002' }));
    await waitFor(() => expect(api.callsTo('PUT /auth/users/2/fridges')).toHaveLength(1));
    expect(api.callsTo('PUT /auth/users/2/fridges')[0]!.body).toEqual({
      fridgeIds: ['fr-1', 'fr-2'],
    });
    expect(await screen.findByText('Холодильники сохранены.')).toBeTruthy();
  });

  it('ошибка сервера при сохранении холодильников показывается на языке интерфейса', async () => {
    const ui = userEvent.setup();
    installFake(
      baseRoutes([person({ role: 'operator' })], {
        'PUT /auth/users/2/fridges': () => fail(404, 'user_not_found', 'auth.error.userNotFound'),
      }),
    );
    renderAt('/admin/users');
    await ui.click(
      await screen.findByRole('button', { name: 'Сохранить холодильники: +37360000002' }),
    );
    expect(await screen.findByText('Пользователь не найден.')).toBeTruthy();
  });
});
