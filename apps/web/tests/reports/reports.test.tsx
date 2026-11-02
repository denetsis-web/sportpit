import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { nav as eventsNav } from '../../src/features/admin/system-events/routes.tsx';
import { nav as reportsNav } from '../../src/features/admin/reports/routes.tsx';
import { filterNavByRole, sortNav } from '../../src/features/admin/shell/menu.ts';
import {
  apiError,
  as,
  cleanUp,
  events,
  installFakeApi,
  ratings,
  renderAt,
  retention,
  sales,
  share,
  waste,
} from './fixtures.tsx';

afterEach(cleanUp);

const allReports = {
  'GET /admin/reports/sales': () => ({ body: sales() }),
  'GET /admin/reports/waste': () => ({ body: waste() }),
  'GET /admin/reports/ratings': () => ({ body: ratings() }),
  'GET /admin/reports/share': () => ({ body: share() }),
  'GET /admin/reports/retention': () => ({ body: retention() }),
};

describe('отчёты: продажи, таблица и график (R37)', () => {
  it('таблица по залам и пакетам, итоги, график по дням, проданные пакеты', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    renderAt('/admin/reports');

    expect(await screen.findByRole('heading', { name: 'Отчёты' })).toBeTruthy();
    const table = (await screen.findByRole('table')) as HTMLElement;
    expect(within(table).getByText('Зал «Север»')).toBeTruthy();
    expect(within(table).getByText('30 боксов')).toBeTruthy();
    expect(within(table).getByText('Без пакета')).toBeTruthy();
    expect(within(table).getByText(/^357\sлей$/)).toBeTruthy();
    expect(screen.getByText(/Выдано боксов: 6, заказов: 3\. Выручка: 664\sлей\./)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Выручка по дням' })).toBeTruthy();
    expect(screen.getByText(/Пакет на 12: оплачено 3, на сумму 4\s284\sлей/)).toBeTruthy();
    expect(screen.getByText('Период: 01.03.2026 — 31.03.2026')).toBeTruthy();
  });

  it('кнопка выгрузки ведёт на CSV за выбранный период на языке интерфейса', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    const link = (await screen.findByRole('link', {
      name: 'Скачать для Excel (CSV)',
    })) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/v1/admin/reports/sales/csv?lang=ru');
    expect(link.hasAttribute('download')).toBe(true);

    await ui.type(screen.getByLabelText('С'), '2026-03-01');
    await ui.type(screen.getByLabelText('По'), '2026-03-15');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));
    await ui.click(screen.getByRole('button', { name: 'Доля зала' }));
    expect(
      (
        screen.getByRole('link', { name: 'Скачать для Excel (CSV)' }) as HTMLAnchorElement
      ).getAttribute('href'),
    ).toBe('/api/v1/admin/reports/share/csv?from=2026-03-01&to=2026-03-15&lang=ru');
  });

  it('выбранный период уходит на сервер, страница начинается с первой', async () => {
    const fake = installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    await screen.findByRole('table');
    expect(fake.callsTo('GET /admin/reports/sales')[0]!.query.get('from')).toBeNull();

    await ui.type(screen.getByLabelText('С'), '2026-02-01');
    await ui.type(screen.getByLabelText('По'), '2026-02-28');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));
    const last = fake.callsTo('GET /admin/reports/sales').at(-1)!;
    await vi.waitFor(() => expect(last.query.get('from')).toBe('2026-02-01'));
    expect(last.query.get('to')).toBe('2026-02-28');
    expect(last.query.get('page')).toBe('1');
  });

  it('страницы по 50 строк: «Вперёд» просит следующую страницу', async () => {
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/reports/sales': (request) => ({
        body: sales({
          page: { number: Number(request.query.get('page')), size: 50, total: 120, pages: 3 },
        }),
      }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    expect(await screen.findByText('Страница 1 из 3')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Назад' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await ui.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(await screen.findByText('Страница 2 из 3')).toBeTruthy();
    expect(fake.callsTo('GET /admin/reports/sales').at(-1)!.query.get('page')).toBe('2');

    // новый период начинает таблицу с первой страницы
    await ui.type(screen.getByLabelText('С'), '2026-02-01');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));
    expect(await screen.findByText('Страница 1 из 3')).toBeTruthy();
    const last = fake.callsTo('GET /admin/reports/sales').at(-1)!;
    expect(last.query.get('page')).toBe('1');
    expect(last.query.get('from')).toBe('2026-02-01');
  });

  it('пустой период: сообщение вместо таблицы', async () => {
    installFakeApi({
      ...as('admin'),
      'GET /admin/reports/sales': () => ({
        body: sales({
          rows: [],
          totals: { orders: 0, boxes: 0, revenueBani: 0 },
          purchases: [],
          page: { number: 1, size: 50, total: 0, pages: 1 },
        }),
      }),
    });
    renderAt('/admin/reports');
    expect(await screen.findByText('За этот период данных нет.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Пакеты за период не продавались.')).toBeTruthy();
  });

  it('ошибка сервера: понятное сообщение и кнопка повтора', async () => {
    let fail = true;
    installFakeApi({
      ...as('admin'),
      'GET /admin/reports/sales': () =>
        fail ? apiError(400, 'bad_range', 'reports.error.range') : { body: sales() },
    });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    expect(await screen.findByText(/Период указан неверно/)).toBeTruthy();
    fail = false;
    await ui.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('отчёты: остальные виды', () => {
  it('выдано и списано: процент списаний, причины, строка запаса и лишнего бокса', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    await screen.findByRole('table');
    await ui.click(screen.getByRole('button', { name: 'Выдано и списано' }));
    const table = (await screen.findByRole('table')) as HTMLElement;
    expect(within(table).getByText('Лосось с овощами')).toBeTruthy();
    expect(within(table).getByText('33,3 %')).toBeTruthy();
    expect(within(table).getByText('Лишний бокс без заказа')).toBeTruthy();
    expect(within(table).getByText('нет данных')).toBeTruthy();
    expect(
      screen.getByText(/Приготовлено: 7, выдано: 6, списано: 2, списания: 28,6 %\./),
    ).toBeTruthy();
    expect(screen.getByText('Брак: 1')).toBeTruthy();
    expect(screen.getByText('Не забрали: 1')).toBeTruthy();
    expect(screen.getByText('Запас на брак: приготовлено 5')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Выдано и списано по дням' })).toBeTruthy();
  });

  it('рейтинг блюд: средняя за период и за всё время', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    await screen.findByRole('table');
    await ui.click(screen.getByRole('button', { name: 'Рейтинг блюд' }));
    const table = (await screen.findByRole('table')) as HTMLElement;
    expect(within(table).getByText('Курица с рисом')).toBeTruthy();
    expect(within(table).getByText('4,5')).toBeTruthy();
    expect(within(table).getByText('4,25 (8)')).toBeTruthy();
  });

  it('доля зала: формула процент × выручка = доля видна в таблице', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    await screen.findByRole('table');
    await ui.click(screen.getByRole('button', { name: 'Доля зала' }));
    const table = (await screen.findByRole('table')) as HTMLElement;
    expect(within(table).getByText(/^12,5% × 466\sлей = 58,25\sлей$/)).toBeTruthy();
    expect(screen.getByText(/Доля зала = процент зала × выручка выданных боксов/)).toBeTruthy();
  });

  it('клиенты и отток: карточки с числами и доля оттока', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    renderAt('/admin/reports');
    await screen.findByRole('table');
    await ui.click(screen.getByRole('button', { name: 'Клиенты и отток' }));
    await screen.findByText('Доля оттока');
    const churn = screen.getByText('Доля оттока').closest('div') as HTMLElement;
    expect(within(churn).getByText('66,7 %')).toBeTruthy();
    const active = screen.getAllByText('Активные клиенты')[0]!.closest('div') as HTMLElement;
    expect(within(active).getByText('3')).toBeTruthy();
    expect(screen.getByText('Предыдущий период: 29.01.2026 — 28.02.2026')).toBeTruthy();
  });

  it('румынский интерфейс: вкладки и подписи без сырых ключей', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const ui = userEvent.setup();
    const { container } = renderAt('/admin/reports', 'ro');
    expect(await screen.findByRole('heading', { name: 'Rapoarte' })).toBeTruthy();
    for (const name of [
      'Vânzări',
      'Ridicate și casate',
      'Clasamentul felurilor',
      'Cota sălii',
      'Clienți și pierderi',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(
      screen.getByRole('link', { name: 'Descarcă pentru Excel (CSV)' }).getAttribute('href'),
    ).toContain('lang=ro');
    await ui.click(screen.getByRole('button', { name: 'Cota sălii' }));
    await screen.findByRole('table');
    expect(container.textContent).not.toMatch(/\breports\.[a-z]/);
  });
});

describe('отчёты: доступ и доступность', () => {
  it('клиенту — «Нет доступа», запросов отчётов нет', async () => {
    const fake = installFakeApi({ ...as('client'), ...allReports });
    renderAt('/admin/reports');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(fake.callsTo('GET /admin/reports/sales')).toHaveLength(0);
  });

  it('пункты меню «Отчёты» и «События системы» видит только администратор', () => {
    const items = [...reportsNav, ...eventsNav];
    expect(sortNav(filterNavByRole(items, 'admin')).map((i) => i.to)).toEqual([
      '/admin/reports',
      '/admin/events',
    ]);
    for (const role of ['operator', 'kitchen', 'client'] as const) {
      expect(filterNavByRole(items, role), role).toEqual([]);
    }
  });

  it('страница отчётов без нарушений доступности (axe)', async () => {
    installFakeApi({ ...as('admin'), ...allReports });
    const { container } = renderAt('/admin/reports');
    await screen.findByRole('table');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('страница «События системы» (R57)', () => {
  it('счётчики за 24 часа, журнал, порог оповещения и ссылка на пропуски температуры', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/system/events': () => ({ body: events() }) });
    renderAt('/admin/events');

    expect(await screen.findByRole('heading', { name: 'События системы' })).toBeTruthy();
    expect(screen.getByText('Сбой SMS: 3')).toBeTruthy();
    expect(screen.getByText('Сбой оплаты: 1')).toBeTruthy();
    expect(screen.getByText(/за час случится 3 и более сбоев оплаты или SMS/)).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/message: провайдер ответил 500/)).toBeTruthy();
    expect(within(table).getByText('11.03.2026 12:30')).toBeTruthy();
    expect(screen.getByText('Пропущено замеров температуры за последние дни: 4.')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Открыть раздел «Температура»' }).getAttribute('href'),
    ).toBe('/admin/temperature');
  });

  it('фильтр по виду события отправляется на сервер, пустой журнал показывает сообщение', async () => {
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/system/events': (request) =>
        request.query.get('kind')
          ? {
              body: events({
                items: [],
                counts24h: {},
                page: { number: 1, size: 50, total: 0, pages: 1 },
              }),
            }
          : { body: events() },
    });
    const ui = userEvent.setup();
    renderAt('/admin/events');
    await screen.findByRole('table');
    await ui.selectOptions(screen.getByLabelText('Вид события'), 'payment_failed');
    expect(await screen.findByText('Событий нет.')).toBeTruthy();
    expect(fake.callsTo('GET /admin/system/events').at(-1)!.query.get('kind')).toBe(
      'payment_failed',
    );
  });

  it('без событий за сутки: так и написано; румынский интерфейс; доступность', async () => {
    installFakeApi({
      ...as('admin'),
      'GET /admin/system/events': () => ({
        body: events({
          counts24h: {},
          items: [],
          page: { number: 1, size: 50, total: 0, pages: 1 },
        }),
      }),
    });
    const { container } = renderAt('/admin/events', 'ro');
    expect(await screen.findByText('În ultimele 24 de ore nu au fost evenimente.')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\breports\.[a-z]/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('клиенту — «Нет доступа»', async () => {
    installFakeApi({ ...as('client'), 'GET /admin/system/events': () => ({ body: events() }) });
    renderAt('/admin/events');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
  });
});
