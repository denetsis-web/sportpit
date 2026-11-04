import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { nav } from '../../src/features/admin/growth/routes.tsx';
import { filterNavByRole, sortNav } from '../../src/features/admin/shell/menu.ts';
import { apiError, as, cleanUp, entry, installFakeApi, list, renderAt } from './fixtures.tsx';

afterEach(cleanUp);

const inFilters = () => within(screen.getByRole('form', { name: 'Фильтры списка' }));

describe('меню админки: «Лист ожидания» и «Воронка» (R36i)', () => {
  it('только администратор видит оба пункта', () => {
    expect(sortNav(filterNavByRole(nav, 'admin')).map((i) => i.to)).toEqual([
      '/admin/waitlist',
      '/admin/funnel',
    ]);
    for (const role of ['kitchen', 'operator', 'client'] as const) {
      expect(filterNavByRole(nav, role), role).toEqual([]);
    }
  });

  it('администратор видит оба пункта в меню админки', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/waitlist': () => ({ body: list() }) });
    renderAt('/admin/waitlist');
    const menu = await screen.findByRole('navigation', { name: 'Навигация админки' });
    expect(within(menu).getByRole('link', { name: 'Лист ожидания' })).toBeTruthy();
    expect(within(menu).getByRole('link', { name: 'Воронка' })).toBeTruthy();
  });

  it('оператору прямая ссылка даёт «Нет доступа» и не грузит список', async () => {
    const fake = installFakeApi({
      ...as('operator'),
      'GET /admin/waitlist': () => ({ body: list() }),
    });
    renderAt('/admin/waitlist');
    expect(await screen.findByRole('heading', { name: 'Нет доступа' })).toBeTruthy();
    expect(fake.callsTo('GET /admin/waitlist')).toHaveLength(0);
  });
});

describe('лист ожидания: список (R19, R21, R22.3)', () => {
  it('показывает телефон, имя, зал, цель, язык, источник, ref, campaign, дату и отметки пути', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/waitlist': () => ({ body: list() }) });
    renderAt('/admin/waitlist');
    expect(await screen.findByRole('heading', { name: 'Лист ожидания' })).toBeTruthy();
    const table = (await screen.findByRole('table')) as HTMLElement;
    const first = within(table).getByText('+37360111222').closest('tr') as HTMLElement;
    for (const text of [
      'Ион',
      'Зал на Ботанике',
      'Похудение',
      'Русский',
      'QR или афиша в зале',
      'qr-botanica',
      'launch',
      '03.11.2026',
    ]) {
      expect(within(first).getByText(new RegExp(text)), text).toBeTruthy();
    }
    expect(within(first).getByText('Считал норму')).toBeTruthy();
    expect(within(first).getByText('Зарегистрировался')).toBeTruthy();
    expect(within(first).queryByText('Купил пакет')).toBeNull();
    expect(screen.getByText('Записей: 2')).toBeTruthy();
  });

  it('у записи без анонимного номера отметок нет', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/waitlist': () => ({ body: list() }) });
    renderAt('/admin/waitlist');
    const table = (await screen.findByRole('table')) as HTMLElement;
    const second = within(table).getByText('+37360333444').closest('tr') as HTMLElement;
    expect(within(second).getByText('Telegram')).toBeTruthy();
    expect(within(second).queryByText('Считал норму')).toBeNull();
    expect(within(second).queryByText('Зарегистрировался')).toBeNull();
    expect(within(second).queryByText('Купил пакет')).toBeNull();
  });

  it('фильтры и страница уходят на сервер, новый фильтр начинает с первой страницы', async () => {
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/waitlist': (request) => ({
        body: list({ total: 120, page: Number(request.query.get('page')) }),
      }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/waitlist');
    expect(await screen.findByText('Страница 1 из 3')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(await screen.findByText('Страница 2 из 3')).toBeTruthy();
    expect(fake.callsTo('GET /admin/waitlist').at(-1)!.query.get('page')).toBe('2');

    await ui.type(inFilters().getByLabelText('Номер или имя'), 'Ион');
    await ui.type(inFilters().getByLabelText('Зал или район'), 'Ботаника');
    await ui.selectOptions(inFilters().getByLabelText('Цель'), 'lose');
    await ui.selectOptions(inFilters().getByLabelText('Язык'), 'ro');
    await ui.selectOptions(inFilters().getByLabelText('Источник'), 'tg');
    await ui.type(inFilters().getByLabelText('С'), '2026-11-01');
    await ui.type(inFilters().getByLabelText('По'), '2026-11-03');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));

    await waitFor(() =>
      expect(fake.callsTo('GET /admin/waitlist').at(-1)!.query.get('q')).toBe('Ион'),
    );
    const last = fake.callsTo('GET /admin/waitlist').at(-1)!;
    expect(Object.fromEntries(last.query)).toEqual({
      q: 'Ион',
      gym: 'Ботаника',
      goal: 'lose',
      lang: 'ro',
      source: 'tg',
      from: '2026-11-01',
      to: '2026-11-03',
      page: '1',
    });
  });

  it('«Скачать CSV» ведёт на выгрузку с теми же фильтрами и языком заголовков; рядом подпись про апостроф', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/waitlist': () => ({ body: list() }) });
    const ui = userEvent.setup();
    renderAt('/admin/waitlist');
    const link = (await screen.findByRole('link', {
      name: 'Скачать для Excel (CSV)',
    })) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/v1/admin/waitlist/csv?labels=ru');
    expect(link.hasAttribute('download')).toBe(true);
    expect(screen.getByText(/перед телефоном стоит апостроф/)).toBeTruthy();

    await ui.selectOptions(inFilters().getByLabelText('Источник'), 'ig');
    await ui.type(inFilters().getByLabelText('Номер или имя'), '606');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('link', { name: 'Скачать для Excel (CSV)' }) as HTMLAnchorElement
        ).getAttribute('href'),
      ).toBe('/api/v1/admin/waitlist/csv?q=606&source=ig&labels=ru'),
    );
  });

  it('удаление: диалог подтверждения, после подтверждения запись исчезает из списка', async () => {
    let items = list().items;
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/waitlist': () => ({ body: list({ items, total: items.length }) }),
      'DELETE /admin/waitlist/1': () => {
        items = items.filter((i) => i.id !== 1);
        return { status: 204 };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/waitlist');
    await screen.findByRole('table');
    await ui.click(screen.getByRole('button', { name: 'Удалить запись +37360111222' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Запись \+37360111222 будет удалена/)).toBeTruthy();
    expect(fake.callsTo('DELETE /admin/waitlist/1')).toHaveLength(0);

    await ui.click(within(dialog).getByRole('button', { name: 'Удалить запись' }));
    await waitFor(() => expect(screen.queryByText('+37360111222')).toBeNull());
    expect(fake.callsTo('DELETE /admin/waitlist/1')).toHaveLength(1);
    expect(screen.getByText('+37360333444')).toBeTruthy();
    expect(screen.getByText('Запись удалена.')).toBeTruthy();
  });

  it('отказ от удаления ничего не отправляет; ошибка удаления показана текстом', async () => {
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/waitlist': () => ({ body: list() }),
      'DELETE /admin/waitlist/2': () => apiError(404, 'not_found', 'growth.error.notFound'),
    });
    const ui = userEvent.setup();
    renderAt('/admin/waitlist');
    await screen.findByRole('table');
    await ui.click(screen.getByRole('button', { name: 'Удалить запись +37360333444' }));
    await ui.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Не удалять' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.callsTo('DELETE /admin/waitlist/2')).toHaveLength(0);

    await ui.click(screen.getByRole('button', { name: 'Удалить запись +37360333444' }));
    await ui.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Удалить запись' }),
    );
    expect(await screen.findByText('Такой записи нет.')).toBeTruthy();
    expect(screen.getByText('+37360333444')).toBeTruthy();
  });

  it('пустой список: «пока никого»; пустой результат фильтра — отдельное сообщение', async () => {
    installFakeApi({
      ...as('admin'),
      'GET /admin/waitlist': () => ({ body: list({ items: [], total: 0 }) }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/waitlist');
    expect(await screen.findByText('В листе ожидания пока никого нет.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    await ui.type(inFilters().getByLabelText('Номер или имя'), 'x');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));
    expect(await screen.findByText('По этим условиям никого не нашли.')).toBeTruthy();
  });

  it('сбой загрузки: сообщение и кнопка «Повторить»', async () => {
    let fail = true;
    installFakeApi({
      ...as('admin'),
      'GET /admin/waitlist': () =>
        fail ? apiError(500, 'internal', 'core.error.generic') : { body: list() },
    });
    const ui = userEvent.setup();
    renderAt('/admin/waitlist');
    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeTruthy();
    expect(screen.getByText(/Не удалось загрузить лист ожидания/)).toBeTruthy();
    fail = false;
    await ui.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('румынский интерфейс и axe без нарушений', async () => {
    installFakeApi({
      ...as('admin'),
      'GET /admin/waitlist': () => ({ body: list({ items: [entry()], total: 1 }) }),
    });
    const { container } = renderAt('/admin/waitlist', 'ro');
    expect(await screen.findByRole('heading', { name: 'Lista de așteptare' })).toBeTruthy();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Slăbire')).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});
