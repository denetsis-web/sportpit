// Настоящая шапка AdminEntry и колокольчик в шапке оболочки (Shell), на всех ролях.
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { apiError, installFakeApi, user } from '../auth/fakeApi.ts';
import { adminModules as shellModules, cleanUp, clientModules } from '../auth/render.tsx';
import { renderApp } from '../helpers.tsx';
import { resetNotifications } from '../../src/features/client/notifications/store.ts';

afterEach(() => {
  resetNotifications();
  cleanUp();
});

const sections: Record<string, FeatureRoutesModule> = {
  ...shellModules,
  'sections/routes.tsx': {
    routes: [
      { path: 'kitchen', element: <h2>Раздел кухни</h2> },
      { path: 'operator', element: <h2>Раздел выдачи</h2> },
      { path: 'reports', element: <h2>Раздел отчётов</h2> },
    ],
    nav: [
      { to: '/admin/kitchen', labelKey: 'auth.role.kitchen' },
      { to: '/admin/operator', labelKey: 'auth.role.operator' },
      { to: '/admin/reports', labelKey: 'auth.role.admin' },
    ],
  },
};

type Who = 'guest' | 'client' | 'kitchen' | 'operator' | 'admin';

function serve(who: Who, unread = 0) {
  return installFakeApi({
    'GET /auth/me': () => ({ body: { user: who === 'guest' ? null : user({ role: who }) } }),
    'GET /notifications': () => ({
      body: {
        items: Array.from({ length: unread }, (_, i) => ({
          id: i + 1,
          type: 'rate_dish',
          payload: {},
          createdAt: '2026-03-10T09:30:00.000Z',
          readAt: null,
        })),
        unreadCount: unread,
      },
    }),
  });
}

function open(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules: sections }, { lang });
}

const adminMenu = () => screen.queryByRole('navigation', { name: 'Навигация админки' });
const links = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent);

describe('шапка AdminEntry показывает разделы роли', () => {
  it('гость: меню нет, ведёт на вход', async () => {
    serve('guest');
    open('/admin');
    expect(await screen.findByLabelText('Номер телефона')).toBeTruthy();
    expect(adminMenu()).toBeNull();
  });

  it('клиент: меню нет, «Нет доступа»', async () => {
    serve('client');
    open('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Нет доступа' })).toBeTruthy();
    expect(adminMenu()).toBeNull();
    expect(screen.queryByText('Раздел кухни')).toBeNull();
  });

  it('клиент на румынском: «Acces interzis»', async () => {
    serve('client');
    open('/admin', 'ro');
    expect(await screen.findByRole('heading', { level: 1, name: 'Acces interzis' })).toBeTruthy();
  });

  it('кухня: только кухня', async () => {
    serve('kitchen');
    open('/admin/kitchen');
    expect(await screen.findByText('Раздел кухни')).toBeTruthy();
    expect(links(adminMenu()!)).toEqual(['кухня']);
  });

  it('оператор: только выдача', async () => {
    serve('operator');
    open('/admin/operator');
    expect(await screen.findByText('Раздел выдачи')).toBeTruthy();
    expect(links(adminMenu()!)).toEqual(['оператор выдачи']);
  });

  it('администратор: все разделы', async () => {
    serve('admin');
    open('/admin/reports');
    expect(await screen.findByText('Раздел отчётов')).toBeTruthy();
    expect(links(adminMenu()!)).toEqual(['кухня', 'оператор выдачи', 'администратор']);
  });

  it('закрытый для роли раздел по прямому адресу — «Нет доступа», содержимое не показывается', async () => {
    serve('kitchen');
    open('/admin/reports');
    expect(await screen.findByRole('heading', { level: 1, name: 'Нет доступа' })).toBeTruthy();
    expect(screen.queryByText('Раздел отчётов')).toBeNull();
  });
});

describe('колокольчик в шапке оболочки', () => {
  const header = () => screen.getByRole('banner');

  it('вошедший видит колокольчик со счётчиком непрочитанных', async () => {
    serve('client', 3);
    open('/');
    const bell = await within(header()).findByRole('link', {
      name: 'Уведомления, непрочитанных: 3',
    });
    expect(bell.getAttribute('href')).toBe('/notifications');
    expect(within(bell).getByText('3')).toBeTruthy();
  });

  it('гость колокольчика не видит', async () => {
    const api = serve('guest');
    open('/');
    await screen.findByRole('heading', { level: 1, name: 'Добро пожаловать' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(header()).queryByRole('link', { name: /Уведомления/ })).toBeNull();
    expect(api.callsTo('GET /notifications')).toHaveLength(0);
  });

  it('в админке колокольчик есть в той же шапке, ровно один', async () => {
    serve('admin', 2);
    open('/admin');
    await within(header()).findByRole('link', { name: 'Уведомления, непрочитанных: 2' });
    expect(within(header()).getAllByRole('link', { name: /Уведомления/ })).toHaveLength(1);
  });

  it('сбой сервера не ломает шапку: колокольчик просто без числа', async () => {
    installFakeApi({
      'GET /auth/me': () => ({ body: { user: user() } }),
      'GET /notifications': () => apiError(500, 'internal_error', 'core.error.generic'),
    });
    open('/');
    expect(await within(header()).findByRole('link', { name: 'Уведомления' })).toBeTruthy();
  });
});
