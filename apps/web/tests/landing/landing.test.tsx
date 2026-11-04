import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError } from '../auth/fakeApi.ts';
import { setMedia } from '../helpers.tsx';
import {
  cleanUp,
  menuBody,
  open,
  packagesBody,
  publicSettings,
  serve,
  unpublishedMenu,
} from './render.tsx';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanUp);

const heading = () => screen.findByRole('heading', { level: 1 });

describe('кто что видит на / и /ro', () => {
  it('гость на / видит лендинг на русском с главной кнопкой', async () => {
    serve();
    open('/');
    expect((await heading()).textContent).toBe('Люби себя делом');
    expect(
      screen.getAllByRole('link', { name: 'Записаться в лист ожидания' }).length,
    ).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('ru');
  });

  it('гость на /ro видит лендинг на румынском', async () => {
    serve();
    open('/ro', 'ro');
    expect((await heading()).textContent).toBe('Iubește-te prin fapte');
    expect(screen.getByRole('link', { name: 'Înscrie-te pe lista de așteptare' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('ro');
  });

  it('ссылка /ro, открытая у посетителя с русским языком, показывает румынский', async () => {
    serve();
    open('/ro', 'ru');
    expect((await heading()).textContent).toBe('Iubește-te prin fapte');
    expect(window.localStorage.getItem('sportpit.lang')).toBe('ro');
  });

  it('румынскоязычного посетителя на / переносит на /ro', async () => {
    serve();
    open('/', 'ro');
    expect((await heading()).textContent).toBe('Iubește-te prin fapte');
  });

  it('вошедший на / видит приложение, а не лендинг', async () => {
    serve({}, true);
    open('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Добро пожаловать' })).toBeTruthy();
    expect(screen.queryByText('Люби себя делом')).toBeNull();
    expect(document.querySelector('.shell__header')).not.toBeNull();
  });

  it('вошедшего с /ro переносит на /', async () => {
    serve({}, true);
    open('/ro', 'ru');
    expect(await screen.findByRole('heading', { level: 1, name: 'Добро пожаловать' })).toBeTruthy();
    expect(screen.queryByText('Iubește-te prin fapte')).toBeNull();
  });

  it('гость в установленном приложении видит прежнюю главную: вход и меню', async () => {
    setMedia('(display-mode: standalone)', true);
    serve();
    open('/');
    const login = await screen.findByRole('link', { name: /^Войти/ });
    expect(login.getAttribute('href')).toBe('/login');
    expect(screen.queryByText('Люби себя делом')).toBeNull();
    expect(document.querySelector('.shell__header')).not.toBeNull();
  });

  it('пока проверяется вход, нет ни лендинга, ни шапки приложения', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    serve({
      'GET /auth/me': async () => {
        await gate;
        return { body: { user: null } };
      },
    });
    open('/');
    await screen.findByRole('status');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelector('.shell__header')).toBeNull();
    expect(document.querySelector('.lp')).toBeNull();
    await act(async () => release());
    expect((await heading()).textContent).toBe('Люби себя делом');
  });

  it('ошибка проверки входа (не сбой сети) приводит к лендингу', async () => {
    serve({ 'GET /auth/me': () => apiError(500, 'server_error', 'core.error.generic') });
    open('/');
    expect((await heading()).textContent).toBe('Люби себя делом');
  });

  it('на лендинге нет шапки приложения, нижнего меню, баннера «Нет связи» и окна выбора языка', async () => {
    serve();
    open('/', null);
    await heading();
    expect(document.querySelector('.shell__header')).toBeNull();
    expect(document.querySelector('.shell__nav')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.queryByText(/Нет связи/)).toBeNull();
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    });
  });
});

describe('переключатель языка', () => {
  it('ведёт между / и /ro и запоминает выбор', async () => {
    const ui = userEvent.setup();
    serve();
    open('/', 'ru');
    await heading();
    await ui.click(screen.getByRole('link', { name: /Română/ }));
    expect((await heading()).textContent).toBe('Iubește-te prin fapte');
    expect(window.localStorage.getItem('sportpit.lang')).toBe('ro');

    await ui.click(screen.getByRole('link', { name: /Русский/ }));
    expect((await heading()).textContent).toBe('Люби себя делом');
    expect(window.localStorage.getItem('sportpit.lang')).toBe('ru');
  });
});

describe('блюда из меню', () => {
  it('карточка с ккал/Б/Ж/У; без фото — место под фото, с фото — картинка', async () => {
    serve();
    open('/');
    const first = await screen.findByRole('heading', { level: 3, name: 'Курица с рисом 1' });
    const card = first.closest('article')!;
    expect(within(card).getByText('520')).toBeTruthy();
    expect(within(card).getByText('42')).toBeTruthy();
    expect(within(card).getByText('14,5')).toBeTruthy();
    expect(within(card).getByText('55')).toBeTruthy();
    expect(within(card).getByText('Место под реальное фото бокса')).toBeTruthy();
    const second = screen
      .getByRole('heading', { level: 3, name: 'Курица с рисом 2' })
      .closest('article')!;
    expect(within(second).getByRole('img').getAttribute('src')).toBe('/api/v1/files/dishes/a.jpg');
    expect(within(second).queryByText('Место под реальное фото бокса')).toBeNull();
  });

  it('меню не опубликовано: «Меню скоро», остальные секции на месте', async () => {
    serve({ 'GET /menu': () => ({ body: unpublishedMenu }) });
    open('/');
    expect(await screen.findByText('Меню скоро')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Платишь за боксы, а не за подписку' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Коротко о главном' })).toBeTruthy();
  });

  it('сбой запроса: сообщение с повтором, остальные секции на месте', async () => {
    const ui = userEvent.setup();
    let fail = true;
    serve({
      'GET /menu': () =>
        fail ? apiError(500, 'server_error', 'core.error.generic') : { body: menuBody() },
    });
    open('/');
    const alert = await screen.findByText(/Не получилось загрузить блюда/);
    expect(alert).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Четыре шага. Счёт — на нас.' })).toBeTruthy();
    fail = false;
    await ui.click(
      within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', {
        name: 'Повторить',
      }),
    );
    expect(await screen.findByRole('heading', { level: 3, name: 'Курица с рисом 1' })).toBeTruthy();
  });
});

describe('пакеты', () => {
  it('боксов, цена за бокс, итог и срок — из GET /packages через money()', async () => {
    serve();
    open('/');
    const pack = (await screen.findByText('119 лей за бокс')).closest('li')!;
    expect(pack.textContent).toContain('12');
    expect(pack.textContent).toContain('боксов');
    expect(pack.textContent).toContain('Итого 1 428 лей'.replace(/ /g, ' '));
    expect(pack.textContent).toContain('Действует 45 дней');
    const single = screen.getByText('129 лей за бокс').closest('li')!;
    expect(single.textContent).toContain('1 бокс');
    expect(packagesBody.items).toHaveLength(2);
  });

  it('пусто и сбой обрабатываются как у блюд', async () => {
    serve({ 'GET /packages': () => ({ body: { items: [] } }) });
    open('/');
    expect(await screen.findByText('Цены скоро')).toBeTruthy();
    cleanUp();

    serve({ 'GET /packages': () => apiError(500, 'server_error', 'core.error.generic') });
    open('/');
    expect(await screen.findByText(/Не получилось загрузить пакеты/)).toBeTruthy();
  });
});

describe('вопросы, кнопки, ссылки', () => {
  it('вопросы раскрываются; ответы — заглушки [ВПИШИ]', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    const summary = (await screen.findByText('Как заказать бокс?')).closest('summary')!;
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    summary.focus();
    expect(document.activeElement).toBe(summary);
    await ui.click(summary);
    expect(details.open).toBe(true);
    expect(within(details).getByText('[ВПИШИ]')).toBeTruthy();
  });

  it('кнопки первого экрана прокручивают к #join и #calc, без анимации при reduced-motion', async () => {
    const ui = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    serve();
    open('/');
    await heading();
    await ui.click(screen.getAllByRole('link', { name: 'Записаться в лист ожидания' })[0]!);
    expect(scroll).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement?.id).toBe('join');

    setMedia('(prefers-reduced-motion: reduce)', true);
    await ui.click(screen.getByRole('link', { name: 'Рассчитать норму' }));
    expect(scroll).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
    expect(document.activeElement?.id).toBe('calc');
  });

  it('секции #calc и #join присутствуют каркасами с заголовками из словаря', async () => {
    serve();
    open('/');
    await heading();
    expect(document.querySelector('#calc h2')?.textContent).toBe('Узнай свои цифры');
    expect(document.querySelector('#join h2')?.textContent).toBe('Будь первым в своём зале');
    expect(screen.getByText('Ориентировочно, не медицинская рекомендация.')).toBeTruthy();
  });

  it('ссылки на соцсети скрыты, пока в словаре заглушка', async () => {
    serve();
    open('/');
    await heading();
    expect(screen.queryByRole('link', { name: 'Telegram' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull();
  });

  it('контакты из настроек выводятся, заглушки — нет', async () => {
    serve({
      'GET /settings/public': () => ({
        body: {
          ...publicSettings,
          supportContacts: {
            phone: '+373 60 123 456',
            email: '[ВПИШИ]',
            messenger: 'https://t.me/x',
          },
        },
      }),
    });
    open('/');
    const phone = await screen.findByRole('link', { name: '+373 60 123 456' });
    expect(phone.getAttribute('href')).toBe('tel:+37360123456');
    expect(screen.getByRole('link', { name: 'https://t.me/x' })).toBeTruthy();
    expect(screen.queryByText('[ВПИШИ]', { selector: 'li' })).toBeNull();
  });

  it('в подвале есть ссылка на «Политика и согласия» и пометка про медицинские рекомендации', async () => {
    serve();
    open('/');
    await heading();
    expect(screen.getByRole('link', { name: 'Политика и согласия' }).getAttribute('href')).toBe(
      '/legal',
    );
    expect(screen.getByText('Лендинг не даёт медицинских рекомендаций.')).toBeTruthy();
  });

  it('нет запросов к чужим серверам и нет кнопок оплаты', async () => {
    const api = serve();
    open('/');
    await heading();
    await screen.findByText('119 лей за бокс');
    for (const call of api.calls) expect(call.path.startsWith('/')).toBe(true);
    expect(screen.queryByRole('button', { name: /Оплат|Купить/ })).toBeNull();
    expect(menuBody().items.length).toBeGreaterThan(0);
  });

  it('вёрстка: бренд-токены на корне .lp, знак — файл из /brand, цвета не зависят от темы', async () => {
    serve();
    open('/');
    await heading();
    const root = document.querySelector('.lp')!;
    expect(root).not.toBeNull();
    const logo = root.querySelector('header img')!;
    expect(logo.getAttribute('src')).toBe('/brand/symbol-on-dark.svg');
  });
});

describe('доступность (axe)', () => {
  it.each(['ru', 'ro'] as const)('лендинг на %s без нарушений', async (lang) => {
    serve();
    const { container } = open(lang === 'ru' ? '/' : '/ro', lang);
    await heading();
    await screen.findByText(lang === 'ru' ? '119 лей за бокс' : '119 lei pe box');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('вид для вошедшего не зависит от лендинга', () => {
  it('мета: название вкладки на лендинге из словаря', async () => {
    serve();
    open('/');
    await heading();
    await waitFor(() =>
      expect(document.title).toBe('SportPit: готовые боксы с КБЖУ в холодильнике твоего зала'),
    );
  });
});
