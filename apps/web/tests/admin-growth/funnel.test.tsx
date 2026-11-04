import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import {
  apiError,
  as,
  cleanUp,
  emptyFunnel,
  funnel,
  installFakeApi,
  renderAt,
} from './fixtures.tsx';

afterEach(cleanUp);

const rowOf = (table: HTMLElement, name: string) =>
  within(table).getByRole('rowheader', { name }).closest('tr') as HTMLElement;
const cellTexts = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('воронка по источникам (R24, R22.4)', () => {
  it('строки по источникам и «Всего», события и доли перехода между этапами', async () => {
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/funnel': () => ({ body: funnel() }),
    });
    renderAt('/admin/funnel');
    expect(await screen.findByRole('heading', { name: 'Воронка' })).toBeTruthy();
    const table = (await screen.findByRole('table', { name: 'Воронка' })) as HTMLElement;
    // 200 просмотров, 50 расчётов (25 %), 10 записей (20 %), 5 регистраций (50 %), 1 покупка (20 %)
    expect(cellTexts(rowOf(table, 'QR или афиша в зале'))).toEqual([
      '200',
      '50 (25 %)',
      '10 (20 %)',
      '5 (50 %)',
      '1 (20 %)',
    ]);
    expect(within(table).getByRole('rowheader', { name: 'Всего' })).toBeTruthy();
    for (const name of ['Тренер', 'Telegram', 'Instagram', 'Прямой заход', 'Другое']) {
      expect(within(table).getByRole('rowheader', { name }), name).toBeTruthy();
    }
    expect(screen.getByText('Период: 05.10.2026 — 04.11.2026')).toBeTruthy();
    // без выбранного периода сервер берёт последние 30 дней сам
    expect(fake.callsTo('GET /admin/funnel')[0]!.query.get('from')).toBeNull();
  });

  it('нулевые этапы показываются без деления на ноль', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/funnel': () => ({ body: funnel() }) });
    renderAt('/admin/funnel');
    const table = (await screen.findByRole('table', { name: 'Воронка' })) as HTMLElement;
    expect(cellTexts(rowOf(table, 'Тренер'))).toEqual(['0', '0 (—)', '0 (—)', '0 (—)', '0 (—)']);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('уникальные люди по этапам — отдельная таблица', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/funnel': () => ({ body: funnel() }) });
    renderAt('/admin/funnel');
    const table = (await screen.findByRole('table', { name: 'Уникальные люди' })) as HTMLElement;
    expect(cellTexts(rowOf(table, 'Всего'))).toEqual(['120', '40', '8', '4', '1']);
    for (const name of ['Посетители', 'Купили']) {
      expect(within(table).getByRole('columnheader', { name }), name).toBeTruthy();
    }
  });

  it('выбранный период уходит на сервер', async () => {
    const fake = installFakeApi({
      ...as('admin'),
      'GET /admin/funnel': () => ({ body: funnel() }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/funnel');
    await screen.findByRole('table', { name: 'Воронка' });
    await ui.type(screen.getByLabelText('С'), '2026-10-01');
    await ui.type(screen.getByLabelText('По'), '2026-10-15');
    await ui.click(screen.getByRole('button', { name: 'Показать' }));
    await waitFor(() =>
      expect(fake.callsTo('GET /admin/funnel').at(-1)!.query.get('from')).toBe('2026-10-01'),
    );
    expect(fake.callsTo('GET /admin/funnel').at(-1)!.query.get('to')).toBe('2026-10-15');
  });

  it('событий нет: «событий пока нет» вместо таблиц', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/funnel': () => ({ body: emptyFunnel() }) });
    renderAt('/admin/funnel');
    expect(await screen.findByText('За этот период событий пока нет.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('сбой загрузки: сообщение и «Повторить»', async () => {
    let fail = true;
    installFakeApi({
      ...as('admin'),
      'GET /admin/funnel': () =>
        fail ? apiError(500, 'internal', 'core.error.generic') : { body: funnel() },
    });
    const ui = userEvent.setup();
    renderAt('/admin/funnel');
    expect(await screen.findByText(/Не удалось загрузить воронку/)).toBeTruthy();
    fail = false;
    await ui.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('table', { name: 'Воронка' })).toBeTruthy();
  });

  it('оператору прямая ссылка даёт «Нет доступа» и не грузит воронку', async () => {
    const fake = installFakeApi({
      ...as('operator'),
      'GET /admin/funnel': () => ({ body: funnel() }),
    });
    renderAt('/admin/funnel');
    expect(await screen.findByRole('heading', { name: 'Нет доступа' })).toBeTruthy();
    expect(fake.callsTo('GET /admin/funnel')).toHaveLength(0);
  });

  it('румынский интерфейс и axe без нарушений', async () => {
    installFakeApi({ ...as('admin'), 'GET /admin/funnel': () => ({ body: funnel() }) });
    const { container } = renderAt('/admin/funnel', 'ro');
    expect(await screen.findByRole('heading', { name: 'Pâlnia' })).toBeTruthy();
    await screen.findAllByRole('table');
    expect(await axe(container)).toHaveNoViolations();
  });
});
