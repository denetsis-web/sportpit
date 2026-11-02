import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { LabelSheet } from '../../src/features/admin/kitchen/LabelPage.tsx';
import { nav } from '../../src/features/admin/kitchen/routes.tsx';
import { filterNavByRole } from '../../src/features/admin/shell/menu.ts';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { apiError, installFakeApi, user, type FakeHandler } from '../auth/fakeApi.ts';
import { cleanUp } from '../auth/render.tsx';
import { registerRealDictionaries, renderApp } from '../helpers.tsx';

const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,kitchen}/routes.tsx'],
  { eager: true },
);

afterEach(cleanUp);

const renderAt = (path: string, lang: 'ru' | 'ro' = 'ru') =>
  renderApp({ initialEntries: [path], clientModules: {}, adminModules }, { lang });

const me = (role: 'client' | 'kitchen' | 'admin' | 'operator'): Record<string, FakeHandler> => ({
  'GET /auth/me': () => ({ body: { user: user({ role }) } }),
});

const batch = (over: Record<string, unknown> = {}) => ({
  id: 5,
  code: '260311-D01-1',
  date: '2026-03-11',
  dishId: 1,
  dishName: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
  status: 'planned',
  plannedQty: 3,
  bufferQty: 1,
  totalQty: 4,
  confirmedAt: null,
  cookedAt: null,
  eatBy: null,
  ...over,
});

const summary = (b: ReturnType<typeof batch> | null, closed = true) => ({
  date: '2026-03-11',
  closed,
  bufferPercent: 25,
  fridges: [
    {
      id: 'f1',
      name: 'Холодильник у входа',
      gymName: 'Зал «Тест»',
      cutoffAt: '2026-03-10T16:00:00.000Z',
      closed,
      closedAt: closed ? '2026-03-10T16:00:00.000Z' : null,
      boxes: 2,
    },
    {
      id: 'f2',
      name: 'У раздевалки',
      gymName: 'Зал «Тест»',
      cutoffAt: '2026-03-10T16:00:00.000Z',
      closed,
      closedAt: closed ? '2026-03-10T16:00:00.000Z' : null,
      boxes: 1,
    },
  ],
  dishes: [
    {
      dishId: 1,
      name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
      planned: 3,
      buffer: 1,
      total: 4,
      fridges: [
        { fridgeId: 'f1', qty: 2 },
        { fridgeId: 'f2', qty: 1 },
      ],
      batch: b,
    },
  ],
  totals: { planned: 3, buffer: 1, total: 4 },
});

describe('кухня: сводка (R32)', () => {
  it('показывает порции по блюдам и по холодильникам, запас отдельной строкой, партию и код', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/summary': () => ({ body: summary(batch()) }),
    });
    renderAt('/admin/kitchen');

    const card = (await screen.findByRole('region', { name: 'Курица с рисом' })) as HTMLElement;
    expect(within(card).getByText(/По заказам: 3/)).toBeTruthy();
    expect(within(card).getByText(/Запас: 1/)).toBeTruthy();
    expect(within(card).getByText(/Готовить: 4/)).toBeTruthy();
    expect(within(card).getByText('Холодильник у входа: 2')).toBeTruthy();
    expect(within(card).getByText('У раздевалки: 1')).toBeTruthy();
    expect(within(card).getByText('Запланирована')).toBeTruthy();
    expect(within(card).getByText('Код партии: 260311-D01-1')).toBeTruthy();
    expect(screen.getByText(/Запас на брак: 25%/)).toBeTruthy();
    expect(screen.getByText('Итого: по заказам 3, запас 1, готовить 4.')).toBeTruthy();
    expect(screen.getByText(/Приём заказов закрыт, сводка зафиксирована/)).toBeTruthy();
    expect(screen.getByText(/Зал «Тест» · Холодильник у входа/)).toBeTruthy();
  });

  it('до закрытия партии нет: вместо кнопок подсказка', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/summary': () => ({ body: summary(null, false) }),
    });
    renderAt('/admin/kitchen');
    expect(await screen.findByText(/Партия появится после закрытия приёма/)).toBeTruthy();
    expect(screen.getByText(/Приём заказов открыт/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Подтвердить производство/ })).toBeNull();
  });

  it('«Подтвердить производство», затем «Отметить приготовленной», затем ссылка на печать', async () => {
    let state = batch();
    const api = installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/summary': () => ({ body: summary(state) }),
      'POST /kitchen/batches/5/confirm': () => {
        state = batch({ status: 'confirmed', confirmedAt: '2026-03-10T16:05:00.000Z' });
        return { body: { batch: state } };
      },
      'POST /kitchen/batches/5/cooked': () => {
        state = batch({
          status: 'cooked',
          cookedAt: '2026-03-10T19:30:00.000Z',
          eatBy: '2026-03-13T19:30:00.000Z',
        });
        return { body: { batch: state } };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/kitchen');

    await ui.click(
      await screen.findByRole('button', { name: 'Подтвердить производство: Курица с рисом' }),
    );
    expect(api.callsTo('POST /kitchen/batches/5/confirm')).toHaveLength(1);
    expect(await screen.findByText('Производство подтверждено')).toBeTruthy();

    await ui.click(
      await screen.findByRole('button', { name: 'Отметить приготовленной: Курица с рисом' }),
    );
    expect(api.callsTo('POST /kitchen/batches/5/cooked')).toHaveLength(1);
    expect(await screen.findByText('Приготовлена')).toBeTruthy();
    // время по Кишинёву: 19:30 UTC = 21:30; «съесть до» через 72 часа
    expect(screen.getByText('Приготовлено: 10.03.2026 21:30')).toBeTruthy();
    expect(screen.getByText('Съесть до: 13.03.2026 21:30')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Печать этикеток: Курица с рисом' });
    expect(link.getAttribute('href')).toBe('/admin/kitchen/label/5');
  });

  it('ошибка сервера при действии показывается на языке интерфейса', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/summary': () => ({ body: summary(batch({ status: 'confirmed' })) }),
      'POST /kitchen/batches/5/cooked': () =>
        apiError(409, 'invalid_transition', 'kitchen.error.notConfirmed'),
    });
    const ui = userEvent.setup();
    renderAt('/admin/kitchen');
    await ui.click(await screen.findByRole('button', { name: /Отметить приготовленной/ }));
    expect(await screen.findByText('Сначала подтвердите производство партии.')).toBeTruthy();
  });

  it('по-румынски: те же данные, подписи и названия блюд на румынском', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/summary': () => ({ body: summary(batch()) }),
    });
    renderAt('/admin/kitchen', 'ro');
    const card = (await screen.findByRole('region', { name: 'Pui cu orez' })) as HTMLElement;
    expect(within(card).getByText(/Rezervă: 1/)).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Confirmă producția: Pui cu orez' }),
    ).toBeTruthy();
  });

  it('клиент и оператор видят «Нет доступа» и не запрашивают сводку', async () => {
    for (const role of ['client', 'operator'] as const) {
      const api = installFakeApi({
        ...me(role),
        'GET /kitchen/summary': () => ({ body: summary(null) }),
      });
      const view = renderAt('/admin/kitchen');
      expect(await screen.findByText('Нет доступа')).toBeTruthy();
      expect(api.callsTo('GET /kitchen/summary')).toHaveLength(0);
      view.unmount();
      cleanUp();
    }
  });

  it('страница доступна без нарушений доступности', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/summary': () => ({
        body: summary(
          batch({
            status: 'cooked',
            cookedAt: '2026-03-10T19:30:00.000Z',
            eatBy: '2026-03-13T19:30:00.000Z',
          }),
        ),
      }),
    });
    const view = renderAt('/admin/kitchen');
    await screen.findByRole('region', { name: 'Курица с рисом' });
    expect(await axe(view.container)).toHaveNoViolations();
  });
});

describe('меню админки: кухня', () => {
  it('раздел кухни виден кухне и администратору, оператору — нет', () => {
    expect(nav.map((n) => n.to)).toEqual(['/admin/kitchen']);
    expect(filterNavByRole(nav, 'kitchen')).toHaveLength(1);
    expect(filterNavByRole(nav, 'admin')).toHaveLength(1);
    expect(filterNavByRole(nav, 'operator')).toHaveLength(0);
    expect(filterNavByRole(nav, 'client')).toHaveLength(0);
  });
});

const LABEL = {
  batchId: 5,
  code: '260311-D01-1',
  date: '2026-03-11',
  copies: 3,
  dish: {
    name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
    composition: { ru: 'куриная грудка, рис, молоко', ro: 'piept de pui, orez, lapte' },
    calories: 520,
    proteinG: 42,
    fatG: 14,
    carbsG: 55,
    fiberG: 6,
    weightG: 380,
    allergens: ['lactose', 'gluten'],
  },
  cookedAt: '2026-03-10T19:30:00.000Z',
  eatBy: '2026-03-13T19:30:00.000Z',
  size: { widthMm: 70, heightMm: 50 },
};

describe('печатная страница этикетки (R33)', () => {
  it('старая партия без клетчатки в снимке: строка клетчатки не печатается, остальное на месте', () => {
    registerRealDictionaries();
    render(<LabelSheet label={{ ...LABEL, dish: { ...LABEL.dish, fiberG: null } } as never} />);
    const text = screen.getByTestId('label').textContent ?? '';
    expect(text).not.toContain('Fibre');
    expect(text).toContain('У/C 55');
  });

  it('содержит название на RU и RO, ккал, БЖУ, состав, аллергены, даты, код партии и размер', async () => {
    registerRealDictionaries();
    const view = render(<LabelSheet label={LABEL as never} />);
    const label = screen.getByTestId('label');
    expect(label.getAttribute('style')).toContain('width: 70mm');
    expect(label.getAttribute('style')).toContain('height: 50mm');
    const text = label.textContent ?? '';
    for (const part of [
      'Курица с рисом',
      'Pui cu orez',
      '520 ккал/kcal',
      'Б/P 42',
      'Ж/G 14',
      'У/C 55',
      'Клетч./Fibre 6',
      'в порции 380 г / într-o porție de 380 g',
      'куриная грудка, рис, молоко',
      'piept de pui, orez, lapte',
      'Аллергены / Alergeni',
      'лактоза/lactoză',
      'глютен/gluten',
      'Приготовлено / Preparat',
      '10.03.2026 21:30',
      'Съесть до / De consumat până la',
      '13.03.2026 21:30',
      '260311-D01-1',
    ]) {
      expect(text, part).toContain(part);
    }
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('страница печати берёт данные у сервера, число этикеток по умолчанию — число порций партии', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/batches/5/label': () => ({ body: LABEL }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/kitchen/label/5');
    expect(
      await screen.findByRole('heading', { name: 'Этикетки партии 260311-D01-1' }),
    ).toBeTruthy();
    expect(screen.getAllByTestId('label')).toHaveLength(3);
    expect(screen.getByText('Размер этикетки: 70×50 мм (меняется в настройках).')).toBeTruthy();
    const copies = screen.getByLabelText('Сколько этикеток');
    await ui.clear(copies);
    await ui.type(copies, '5');
    expect(screen.getAllByTestId('label')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Печатать' })).toBeTruthy();
  });

  it('партия не приготовлена: понятная ошибка вместо этикеток', async () => {
    installFakeApi({
      ...me('kitchen'),
      'GET /kitchen/batches/5/label': () =>
        apiError(409, 'batch_not_cooked', 'kitchen.error.notCooked'),
    });
    renderAt('/admin/kitchen/label/5');
    expect(
      await screen.findByText(/Этикетки печатаются после того, как партия отмечена/),
    ).toBeTruthy();
    expect(screen.queryAllByTestId('label')).toHaveLength(0);
  });
});
