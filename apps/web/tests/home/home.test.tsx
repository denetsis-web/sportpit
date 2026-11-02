import { screen } from '@testing-library/react';
import { matchRoutes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import ro from '../../../../packages/shared/src/i18n/core/ro.ts';
import ru from '../../../../packages/shared/src/i18n/core/ru.ts';
import { clientModules as realClientModules } from '../../src/app/modules.ts';
import { collectFeatures, type FeatureRoutesModule } from '../../src/app/routes.tsx';
import { adminUser, installFake } from '../admin-catalog/fake.ts';
import { cleanUp } from '../auth/render.tsx';
import { renderApp } from '../helpers.tsx';

// главная страница клиента: вместо заглушки — карточки-ссылки на существующие разделы

const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/*/routes.tsx'],
  { eager: true },
);

afterEach(() => {
  cleanUp();
  vi.restoreAllMocks();
});

const hrefs = () =>
  screen
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'))
    .filter((h): h is string => h !== null);

describe('главная страница клиента', () => {
  it('заглушки «Разделы появятся…» больше нет ни в русском, ни в румынском словаре', () => {
    for (const dictionary of [ru, ro] as Array<Record<string, string>>) {
      expect(Object.keys(dictionary)).not.toContain('home.stub');
      expect(Object.values(dictionary).join('\n')).not.toMatch(
        /Разделы появятся|Secțiunile vor apărea/,
      );
    }
  });

  it('вошедший видит ссылки на меню, пакеты, заказы, получение, трекер, профиль и поддержку', async () => {
    installFake({ 'GET /auth/me': () => ({ body: { user: adminUser('client') } }) });
    renderApp({ initialEntries: ['/'], clientModules, adminModules: {} });
    await screen.findByRole('link', { name: /Меню/ });
    const main = screen.getByRole('main');
    const inMain = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(inMain).toEqual(
      expect.arrayContaining([
        '/menu',
        '/packages',
        '/orders',
        '/pickup',
        '/tracker',
        '/profile',
        '/support',
      ]),
    );
    expect(inMain).not.toContain('/login');
    expect(inMain).not.toContain('/admin');
    expect(main.textContent).not.toMatch(/Разделы появятся/);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('каждая ссылка главной ведёт на существующий маршрут клиента', async () => {
    installFake({ 'GET /auth/me': () => ({ body: { user: adminUser('admin') } }) });
    renderApp({ initialEntries: ['/'], clientModules, adminModules: {} });
    await screen.findByRole('link', { name: /Меню/ });
    const main = screen.getByRole('main');
    const targets = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href')!);
    expect(targets.length).toBeGreaterThanOrEqual(7);
    // реальные маршруты проекта; админка живёт под /admin/*
    const { routes } = collectFeatures(realClientModules);
    for (const to of targets) {
      const known = to.startsWith('/admin') || matchRoutes(routes, to) !== null;
      expect(known, to).toBe(true);
    }
    // сотрудник видит и вход в админку
    expect(targets).toContain('/admin');
  });

  it('гость видит вход и меню, но не личные разделы', async () => {
    installFake({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderApp({ initialEntries: ['/'], clientModules, adminModules: {} });
    await screen.findByRole('link', { name: /^Войти/ });
    const inMain = [...screen.getByRole('main').querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(inMain).toContain('/login');
    expect(inMain).toContain('/menu');
    for (const personal of ['/orders', '/pickup', '/tracker', '/profile', '/support']) {
      expect(inMain, personal).not.toContain(personal);
    }
    expect(hrefs().length).toBeGreaterThan(0);
  });

  it('на румынском карточки подписаны по-румынски', async () => {
    installFake({ 'GET /auth/me': () => ({ body: { user: adminUser('client') } }) });
    renderApp({ initialEntries: ['/'], clientModules, adminModules: {} }, { lang: 'ro' });
    expect(await screen.findByRole('link', { name: /Comenzile mele/ })).toBeTruthy();
  });
});
