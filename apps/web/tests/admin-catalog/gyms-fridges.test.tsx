import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { cleanUp } from '../auth/render.tsx';
import { renderAt } from '../menu/fixtures.tsx';
import { admin, adminUser, fail, installFake } from './fake.ts';

// формы набираются по символам: при полном прогоне на нагруженной машине 5 секунд мало
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanUp();
  vi.restoreAllMocks();
});

const gym = (over: Record<string, unknown> = {}) => ({
  id: 'gym-1',
  name: 'Зал «Атлант»',
  address: 'ул. Тестовая, 1',
  sharePercent: 12.5,
  active: true,
  ...over,
});

const fridge = (over: Record<string, unknown> = {}) => ({
  id: 'fr-main',
  gymId: 'gym-1',
  gymName: 'Зал «Атлант»',
  gymSharePercent: 12.5,
  name: 'У входа',
  capacityBoxes: 40,
  cutoffTime: '18:00',
  pickupFrom: '07:00',
  pickupTo: '22:00',
  accessCode: null,
  active: true,
  ...over,
});

describe('админка: залы (R07, R36.3)', () => {
  it('список залов, добавление: на сервер уходит название, адрес, доля и признак активности', async () => {
    const ui = userEvent.setup();
    let items = [gym()];
    const api = installFake({
      ...admin,
      'GET /admin/gyms': () => ({ body: { items } }),
      'POST /admin/gyms': (req) => {
        items = [...items, gym({ id: 'gym-2', ...(req.body as Record<string, unknown>) })];
        return { status: 201, body: items[1] };
      },
    });
    renderAt('/admin/gyms');
    expect(await screen.findByText('Зал «Атлант»')).toBeTruthy();
    expect(screen.getByText(/доля 12,5%/)).toBeTruthy();

    await ui.click(screen.getByRole('button', { name: 'Добавить зал' }));
    await ui.type(screen.getByLabelText('Название зала'), 'Зал «Форт»');
    await ui.clear(screen.getByLabelText('Доля зала, %'));
    await ui.type(screen.getByLabelText('Доля зала, %'), '8,5');
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.callsTo('POST /admin/gyms')).toHaveLength(1));
    expect(api.callsTo('POST /admin/gyms')[0]!.body).toEqual({
      name: 'Зал «Форт»',
      address: null,
      sharePercent: 8.5,
      active: true,
    });
    expect(await screen.findByText('Зал «Форт»')).toBeTruthy();
  });

  it('правка отправляет PATCH для этого зала; отключённый зал помечен', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/gyms': () => ({ body: { items: [gym({ active: false })] } }),
      'PATCH /admin/gyms/gym-1': (req) => ({ body: gym(req.body as Record<string, unknown>) }),
    });
    renderAt('/admin/gyms');
    expect(await screen.findByText('Отключено')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Изменить' }));
    await ui.click(screen.getByLabelText('Включено'));
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.callsTo('PATCH /admin/gyms/gym-1')).toHaveLength(1));
    expect(api.callsTo('PATCH /admin/gyms/gym-1')[0]!.body).toMatchObject({ active: true });
  });

  it('ошибки полей от сервера показываются у поля, форма остаётся открытой с введёнными значениями', async () => {
    const ui = userEvent.setup();
    installFake({
      ...admin,
      'GET /admin/gyms': () => ({ body: { items: [] } }),
      'POST /admin/gyms': () =>
        fail(400, 'validation_failed', 'core.error.validation', {
          sharePercent: 'admin.error.percent',
        }),
    });
    renderAt('/admin/gyms');
    expect(await screen.findByText('Залов пока нет.')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Добавить зал' }));
    await ui.type(screen.getByLabelText('Название зала'), 'Х');
    await ui.clear(screen.getByLabelText('Доля зала, %'));
    await ui.type(screen.getByLabelText('Доля зала, %'), '101');
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Укажите процент от 0 до 100.');
    expect((screen.getByLabelText('Доля зала, %') as HTMLInputElement).value).toBe('101');
    expect(screen.getByLabelText('Доля зала, %').getAttribute('aria-invalid')).toBe('true');
  });

  it('клиент видит «Нет доступа», запросов к админским данным нет', async () => {
    const api = installFake({
      'GET /auth/me': () => ({ body: { user: adminUser('client') } }),
      'GET /admin/gyms': () => ({ body: { items: [] } }),
    });
    renderAt('/admin/gyms');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(api.callsTo('GET /admin/gyms')).toHaveLength(0);
  });

  it('нет автоматических нарушений доступности', async () => {
    const ui = userEvent.setup();
    installFake({ ...admin, 'GET /admin/gyms': () => ({ body: { items: [gym()] } }) });
    const { container } = renderAt('/admin/gyms');
    await screen.findByText('Зал «Атлант»');
    await ui.click(screen.getByRole('button', { name: 'Добавить зал' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('админка: холодильники (R07, R45, R46)', () => {
  it('создание: значения по умолчанию окно 07:00–22:00 и срок 18:00 уходят на сервер вместе с вместимостью и кодом замка', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/fridges': () => ({ body: { items: [] } }),
      'GET /admin/gyms': () => ({ body: { items: [gym()] } }),
      'POST /admin/fridges': (req) => ({
        status: 201,
        body: fridge(req.body as Record<string, unknown>),
      }),
    });
    renderAt('/admin/fridges');
    await ui.click(await screen.findByRole('button', { name: 'Добавить холодильник' }));
    expect((screen.getByLabelText('Приём заказов до') as HTMLInputElement).value).toBe('18:00');
    expect((screen.getByLabelText('Выдача с') as HTMLInputElement).value).toBe('07:00');
    expect((screen.getByLabelText('Выдача до') as HTMLInputElement).value).toBe('22:00');
    await ui.type(screen.getByLabelText('Название холодильника'), 'У ресепшена');
    await ui.clear(screen.getByLabelText('Вместимость, боксов'));
    await ui.type(screen.getByLabelText('Вместимость, боксов'), '25');
    await ui.type(screen.getByLabelText('Код замка'), '4821');
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.callsTo('POST /admin/fridges')).toHaveLength(1));
    expect(api.callsTo('POST /admin/fridges')[0]!.body).toEqual({
      gymId: 'gym-1',
      name: 'У ресепшена',
      capacityBoxes: 25,
      cutoffTime: '18:00',
      pickupFrom: '07:00',
      pickupTo: '22:00',
      accessCode: '4821',
      active: true,
    });
  });

  it('без включённых залов холодильник добавить нельзя — подсказка', async () => {
    installFake({
      ...admin,
      'GET /admin/fridges': () => ({ body: { items: [] } }),
      'GET /admin/gyms': () => ({ body: { items: [] } }),
    });
    renderAt('/admin/fridges');
    expect(await screen.findByText('Сначала добавьте и включите хотя бы один зал.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Добавить холодильник' })).toBeNull();
  });

  it('список показывает зал, вместимость, срок и окно; ошибка окна выдачи от сервера видна у поля', async () => {
    const ui = userEvent.setup();
    installFake({
      ...admin,
      'GET /admin/fridges': () => ({ body: { items: [fridge()] } }),
      'GET /admin/gyms': () => ({ body: { items: [gym()] } }),
      'PATCH /admin/fridges/fr-main': () =>
        fail(400, 'validation_failed', 'core.error.validation', { pickupTo: 'admin.error.window' }),
    });
    renderAt('/admin/fridges');
    expect(
      await screen.findByText('Вместимость 40 · приём заказов до 18:00 · выдача 07:00–22:00'),
    ).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Изменить' }));
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Начало окна выдачи должно быть раньше конца.',
    );
  });

  it('QR-плакат: ссылка ведёт на /menu?fridge=<id>, QR нарисован, печать вызывает window.print', async () => {
    const ui = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    installFake({ ...admin, 'GET /admin/fridges/fr-main': () => ({ body: fridge() }) });
    renderAt('/admin/fridges/fr-main/poster');
    const link = await screen.findByTestId('poster-link');
    expect(link.textContent).toBe(`${window.location.origin}/menu?fridge=fr-main`);
    const qr = await screen.findByRole('img', {
      name: `QR-код со ссылкой ${window.location.origin}/menu?fridge=fr-main`,
    });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(qr.getAttribute('src')!)).toContain('<svg');
    expect(screen.getByText('Вкусно. Свежо. Чётко по КБЖУ')).toBeTruthy();
    expect(within(document.body).getByText('Зал «Атлант»')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Печать' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('идентификатор со спецсимволами кодируется в ссылке плаката', async () => {
    installFake({
      ...admin,
      'GET /admin/fridges/fr_1-a': () => ({ body: fridge({ id: 'fr_1-a' }) }),
    });
    renderAt('/admin/fridges/fr_1-a/poster');
    expect((await screen.findByTestId('poster-link')).textContent).toContain('/menu?fridge=fr_1-a');
  });
});
