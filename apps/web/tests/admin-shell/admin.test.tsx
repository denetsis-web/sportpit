import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { AdminHome } from '../../src/features/admin/shell/AdminHome.tsx';
import { filterNavByRole, type AdminNavItem } from '../../src/features/admin/shell/menu.ts';
import { installFakeApi, user } from '../auth/fakeApi.ts';
import { cleanUp, renderAt, renderComponent } from '../auth/render.tsx';

afterEach(cleanUp);

const ITEMS: AdminNavItem[] = [
  { to: '/admin/kitchen', labelKey: 'probe.kitchen' },
  { to: '/admin/operator', labelKey: 'probe.operator' },
  { to: '/admin/reports', labelKey: 'probe.reports' },
  { to: '/admin/fridge-temps', labelKey: 'probe.temps', roles: ['operator', 'admin'] },
];
const labels = (items: AdminNavItem[]) => items.map((i) => i.to);

describe('меню админки по ролям', () => {
  it('кухня видит только кухню, оператор — только выдачу, администратор — всё', () => {
    expect(labels(filterNavByRole(ITEMS, 'kitchen'))).toEqual(['/admin/kitchen']);
    expect(labels(filterNavByRole(ITEMS, 'operator'))).toEqual([
      '/admin/operator',
      '/admin/fridge-temps',
    ]);
    expect(labels(filterNavByRole(ITEMS, 'admin'))).toEqual(labels(ITEMS));
  });

  it('клиент не видит ни одного раздела; неизвестный раздел по умолчанию только для администратора', () => {
    expect(filterNavByRole(ITEMS, 'client')).toEqual([]);
    expect(labels(filterNavByRole([{ to: '/admin/new-thing', labelKey: 'x' }], 'kitchen'))).toEqual(
      [],
    );
    expect(labels(filterNavByRole([{ to: '/admin/new-thing', labelKey: 'x' }], 'admin'))).toEqual([
      '/admin/new-thing',
    ]);
  });

  it('явный список ролей у пункта главнее умолчания', () => {
    const items: AdminNavItem[] = [{ to: '/admin/kitchen', labelKey: 'x', roles: ['admin'] }];
    expect(filterNavByRole(items, 'kitchen')).toEqual([]);
  });
});

describe('главная админки', () => {
  function mount(role: 'kitchen' | 'operator' | 'admin' | 'client', items = ITEMS) {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: user({ role }) } }) });
    return renderComponent(
      <main>
        <AdminHome items={items} />
      </main>,
      '/admin',
    );
  }

  it('показывает ссылки только на разделы своей роли', async () => {
    const items: AdminNavItem[] = [
      { to: '/admin/kitchen', labelKey: 'auth.role.kitchen' },
      { to: '/admin/operator', labelKey: 'auth.role.operator' },
      { to: '/admin/reports', labelKey: 'auth.role.admin' },
    ];
    mount('kitchen', items);
    const menu = await screen.findByRole('navigation', { name: 'Разделы админки' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['кухня']);
    expect(within(menu).getByRole('link', { name: 'кухня' }).getAttribute('href')).toBe(
      '/admin/kitchen',
    );
  });

  it('у администратора все разделы, порядок — по полю order', async () => {
    const items: AdminNavItem[] = [
      { to: '/admin/reports', labelKey: 'auth.role.admin', order: 20 },
      { to: '/admin/kitchen', labelKey: 'auth.role.kitchen', order: 10 },
    ];
    mount('admin', items);
    const menu = await screen.findByRole('navigation', { name: 'Разделы админки' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['кухня', 'администратор']);
  });

  it('если для роли разделов нет — понятное пустое состояние', async () => {
    mount('operator', [{ to: '/admin/reports', labelKey: 'auth.role.admin' }]);
    expect(await screen.findByText('Для вашей роли пока нет разделов.')).toBeTruthy();
  });

  it('доступность', async () => {
    mount('admin');
    await screen.findByRole('navigation', { name: 'Разделы админки' });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('/admin в приложении', () => {
  it('без входа ведёт на экран входа', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderAt('/admin');
    expect(await screen.findByLabelText('Номер телефона')).toBeTruthy();
  });

  it('клиент видит «Нет доступа» на русском и румынском, без пустой страницы', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: user({ role: 'client' }) } }) });
    renderAt('/admin');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.getByText('У вас нет прав для просмотра этого раздела.')).toBeTruthy();
    cleanUp();
    document.body.innerHTML = '';
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: user({ role: 'client' }) } }) });
    renderAt('/admin', 'ro');
    expect(await screen.findByText('Acces interzis')).toBeTruthy();
  });

  it('сотрудник попадает на главную админки', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: user({ role: 'admin' }) } }) });
    renderAt('/admin');
    expect(await screen.findByText('Выберите раздел.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Админка');
  });
});
