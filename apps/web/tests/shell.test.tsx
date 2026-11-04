import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictionaryModule } from '@sportpit/shared/i18n';
import type { FeatureRoutesModule } from '../src/app/routes.tsx';
import { resetSession } from '../src/features/client/auth/session.ts';
import { installFakeApi, user } from './auth/fakeApi.ts';
import { DARK, renderApp, setMedia } from './helpers.tsx';
import { clientModules as landingModules } from './landing/render.tsx';

// Гость в браузере на / видит лендинг без оболочки (см. ниже и tests/landing). Эти проверки идут в установленном
// приложении (standalone), где гость видит прежнюю главную внутри оболочки.
beforeEach(() => {
  serveGuest();
  setMedia('(display-mode: standalone)', true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSession();
});

/** Оболочка при каждом запуске спрашивает сервер, кто вошёл (колокольчик): в тестах отвечает поддельный сервер. */
const serveGuest = () => installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });

/** Админка открыта только сотрудникам: в этих тестах заходит администратор. */
const signInAsAdmin = () =>
  installFakeApi({ 'GET /auth/me': () => ({ body: { user: user({ role: 'admin' }) } }) });

const RU_SLOGAN = 'Вкусно. Свежо. Чётко по КБЖУ';
const probeDictionaries = import.meta.glob<DictionaryModule>('./fixtures/i18n/*/{ru,ro}.ts', {
  eager: true,
});
const probeClient = import.meta.glob<FeatureRoutesModule>('./fixtures/features/**/routes.tsx', {
  eager: true,
});
const probeAdmin = import.meta.glob<FeatureRoutesModule>('./fixtures/admin/**/routes.tsx', {
  eager: true,
});

describe('переключатель языка RU / RO', () => {
  it('по умолчанию русский: слоган в приветствии, lang документа ru', () => {
    renderApp();
    expect(screen.getByText(RU_SLOGAN)).toBeTruthy();
    expect(document.documentElement.lang).toBe('ru');
  });

  it('переключение меняет весь интерфейс и сохраняется в localStorage', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /Română/ }));

    expect(screen.queryByText(RU_SLOGAN)).toBeNull();
    expect(screen.getByText('Gustos. Proaspăt. Exact pe calorii și macro')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bun venit');
    expect(document.documentElement.lang).toBe('ro');
    expect(window.localStorage.getItem('sportpit.lang')).toBe('ro');

    // В интерфейсе не осталось русских фраз, кроме самого названия языка «Русский» в подсказке кнопки
    const visible = document.body.textContent!.replace(/Русский/g, '');
    expect(visible).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('после перезагрузки (новый запуск приложения) выбор сохраняется', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /Română/ }));
    first.unmount();
    cleanup();

    renderApp({}, { lang: null }); // lang: null — ничего не записываем, берём то, что осталось в localStorage
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bun venit');
  });

  it('при первом запуске предлагает выбрать язык, выбор закрывает окно и запоминается', async () => {
    const user = userEvent.setup();
    renderApp({}, { lang: null });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toContain('Alegeți limba');

    await user.click(within(dialog).getByRole('button', { name: 'Română' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem('sportpit.lang')).toBe('ro');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bun venit');
  });
});

describe('светлая и тёмная темы', () => {
  const html = document.documentElement;

  it('по умолчанию следует за системой: атрибута нет, работает prefers-color-scheme', () => {
    setMedia(DARK, true);
    renderApp();
    expect(html.hasAttribute('data-theme')).toBe(false);
  });

  it('переключатель идёт по кругу: как в системе → светлая → тёмная → как в системе', async () => {
    const user = userEvent.setup();
    renderApp();
    const toggle = () => screen.getByRole('button', { name: /Тема оформления/ });
    expect(toggle().textContent).toBe('Как в системе');

    await user.click(toggle());
    expect(toggle().textContent).toBe('Светлая');
    expect(html.getAttribute('data-theme')).toBe('light');

    await user.click(toggle());
    expect(toggle().textContent).toBe('Тёмная');
    expect(html.getAttribute('data-theme')).toBe('dark');

    await user.click(toggle());
    expect(html.hasAttribute('data-theme')).toBe(false);
  });

  it('ручной выбор сохраняется и переживает перезагрузку', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /Тема оформления/ })); // светлая
    await user.click(screen.getByRole('button', { name: /Тема оформления/ })); // тёмная
    expect(window.localStorage.getItem('sportpit.theme')).toBe('dark');
    first.unmount();
    cleanup();
    html.removeAttribute('data-theme');

    renderApp({}, { lang: null });
    expect(html.getAttribute('data-theme')).toBe('dark');
  });

  it('подпись переключателя темы переводится вместе с языком', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: /Română/ }));
    expect(screen.getByRole('button', { name: /Tema aplicației/ }).textContent).toBe(
      'Ca în sistem',
    );
  });
});

describe('баннер «Нет связи»', () => {
  it('появляется, когда пропала сеть, и исчезает, когда вернулась', async () => {
    renderApp();
    expect(screen.queryByText(/Нет связи/)).toBeNull();

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('Нет связи');

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.queryByText(/Нет связи/)).toBeNull());
  });

  it('текст баннера на румынском', async () => {
    renderApp({}, { lang: 'ro' });
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect((await screen.findByRole('status')).textContent).toContain('Fără conexiune');
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
  });
});

describe('оболочка на адресах лендинга', () => {
  it('гостю в браузере — только содержимое: ни шапки, ни нижнего меню, ни окна выбора языка', async () => {
    setMedia('(display-mode: standalone)', false);
    renderApp({ initialEntries: ['/'], clientModules: landingModules }, { lang: null });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Люби себя делом');
    expect(document.querySelector('.shell__header')).toBeNull();
    expect(document.querySelector('.shell__nav')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('в установленном приложении та же страница живёт в оболочке, с окном выбора языка', async () => {
    renderApp({ initialEntries: ['/'], clientModules: landingModules }, { lang: null });
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(document.querySelector('.shell__header')).not.toBeNull();
  });
});

describe('автообнаружение функций клиента и админки', () => {
  it('функция с routes.tsx и пространством словаря подхватывается без правки общих файлов', async () => {
    renderApp(
      { initialEntries: ['/probe'], clientModules: probeClient },
      { dictionaries: probeDictionaries },
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Проба: страница функции');
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(within(nav).getByRole('link', { name: 'Проба' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('словарь функции переключается вместе с интерфейсом', async () => {
    const user = userEvent.setup();
    renderApp(
      { initialEntries: ['/probe'], clientModules: probeClient },
      { dictionaries: probeDictionaries },
    );
    await user.click(screen.getByRole('button', { name: /Română/ }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Probă: pagina funcției');
  });

  it('админка грузится лениво на /admin и собирает свои модули', async () => {
    signInAsAdmin();
    renderApp(
      { initialEntries: ['/admin/probe-admin'], adminModules: probeAdmin },
      { dictionaries: probeDictionaries },
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Проба: страница админки' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Админка');
    const nav = screen.getByRole('navigation', { name: 'Навигация админки' });
    expect(within(nav).getByRole('link', { name: 'Проба админки' })).toBeTruthy();
  });

  it('пока в админке нет разделов, показывает пустое состояние, а не пустую страницу', async () => {
    signInAsAdmin();
    renderApp({ initialEntries: ['/admin'] });
    expect(await screen.findByText('Разделов пока нет.')).toBeTruthy();
  });

  it('неизвестный адрес — страница «не найдено» с ссылкой на главную', () => {
    renderApp({ initialEntries: ['/нет-такой-страницы'] });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Страница не найдена');
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/');
  });
});

describe('доступность оболочки (axe)', () => {
  it.each(['ru', 'ro'] as const)('приветствие на %s без критических нарушений', async (lang) => {
    const { container } = renderApp({}, { lang });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('окно выбора языка без нарушений', async () => {
    const { baseElement } = renderApp({}, { lang: null });
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('есть ссылка «к основному содержимому» и метка у основной области', () => {
    renderApp();
    expect(screen.getByRole('link', { name: 'К основному содержимому' }).getAttribute('href')).toBe(
      '#main',
    );
    expect(screen.getByRole('main')).toBeTruthy();
  });
});
