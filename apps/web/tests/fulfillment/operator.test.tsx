import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { nav } from '../../src/features/admin/operator/routes.tsx';
import { filterNavByRole } from '../../src/features/admin/shell/menu.ts';
import {
  apiError,
  cleanUp,
  dayOverview,
  installFakeApi,
  NAME_A,
  renderAt,
  user,
} from './fixtures.tsx';

afterEach(cleanUp);

const as = (role: 'operator' | 'admin' | 'client') => ({
  'GET /auth/me': () => ({ body: { user: user({ role, fridgeIds: ['fridge-1'] }) } }),
});

const fridges = {
  'GET /operator/fridges': () => ({
    body: {
      items: [
        {
          id: 'fridge-1',
          name: 'Холодильник у входа',
          gymName: 'Зал «Тест»',
          pickupFrom: '07:00',
          pickupTo: '22:00',
        },
      ],
    },
  }),
};

describe('оператор: график загрузки и «загружено» (R34)', () => {
  it('показывает, сколько боксов каких блюд положить, партии и итоги; кодов клиентов нет', async () => {
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({ body: dayOverview() }),
    });
    renderAt('/admin/operator');
    const load = (await screen.findByRole('region', { name: 'Что положить' })) as HTMLElement;
    expect(within(load).getByText('2 × Курица с рисом')).toBeTruthy();
    expect(within(load).getByText('1 × Лосось с овощами')).toBeTruthy();
    expect(within(load).getAllByText(/приготовлена/)).toHaveLength(2);
    expect(within(load).getByText(/Боксов: 3, ждут выдачи: 3, выдано: 0, списано: 0/)).toBeTruthy();
    expect(screen.getByText('Окно выдачи: 07:00–22:00')).toBeTruthy();
    expect(screen.queryByText(/4207/)).toBeNull();
  });

  it('пока блюда не приготовлены, «загружено» недоступно и названы блюда', async () => {
    const day = dayOverview({
      blockedDishes: ['Курица с рисом'],
      items: [
        {
          dishId: 1,
          name: NAME_A,
          qty: 2,
          batch: { id: 5, code: '260311-D01-1', status: 'confirmed' },
          cooked: false,
        },
      ],
    });
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({ body: day }),
    });
    renderAt('/admin/operator');
    expect(await screen.findByText('Пока не приготовлено: Курица с рисом.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Отметить «загружено»' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('«загружено» отправляет дату и показывает время отметки', async () => {
    let loaded = false;
    const fake = installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({
        body: loaded
          ? dayOverview({ loaded: true, loadedAt: '2026-03-11T05:00:00.000Z' })
          : dayOverview(),
      }),
      'POST /operator/fridges/fridge-1/loaded': () => {
        loaded = true;
        return { body: { loaded: true, loadedAt: '2026-03-11T05:00:00.000Z', orders: 1 } };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');
    await ui.click(await screen.findByRole('button', { name: 'Отметить «загружено»' }));
    expect(fake.callsTo('POST /operator/fridges/fridge-1/loaded')[0]!.body).toEqual({
      date: '2026-03-11',
    });
    expect(await screen.findByText(/Загружено в 07:00/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Отметить «загружено»' })).toBeNull();
  });

  it('ошибка сервера при загрузке показывается текстом', async () => {
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({ body: dayOverview() }),
      'POST /operator/fridges/fridge-1/loaded': () =>
        apiError(409, 'batches_not_cooked', 'fulfillment.error.batchesNotCooked', {
          dishes: 'Курица с рисом',
        }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');
    await ui.click(await screen.findByRole('button', { name: 'Отметить «загружено»' }));
    expect(await screen.findByText(/Не все блюда приготовлены: Курица с рисом/)).toBeTruthy();
  });

  it('оператор без холодильников видит подсказку', async () => {
    installFakeApi({
      ...as('operator'),
      'GET /operator/fridges': () => ({ body: { items: [] } }),
    });
    renderAt('/admin/operator');
    expect(await screen.findByText(/не закреплено ни одного холодильника/)).toBeTruthy();
  });

  it('клиенту — «Нет доступа»', async () => {
    installFakeApi({ ...as('client'), ...fridges });
    renderAt('/admin/operator');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
  });
});

describe('оператор: выдача по коду клиента (R25.1)', () => {
  it('неверный код — понятная ошибка; верный — подтверждение; повтор — «уже выдан»', async () => {
    let attempt = 0;
    const fake = installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({
        body: dayOverview({ loaded: true, loadedAt: '2026-03-11T05:00:00.000Z' }),
      }),
      'POST /operator/fridges/fridge-1/pickup': () => {
        attempt += 1;
        if (attempt === 1) return apiError(404, 'invalid_code', 'fulfillment.error.invalidCode');
        return {
          body: {
            orderId: 'ord-1',
            status: 'picked_up',
            alreadyPickedUp: attempt === 3,
            boxes: 3,
            items: [{ dishId: 1, qty: 2, name: NAME_A }],
          },
        };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');
    const field = await screen.findByLabelText('Код клиента (4 цифры)');
    const submit = screen.getByRole('button', { name: 'Выдать' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await ui.type(field, '12a34');
    expect((field as HTMLInputElement).value).toBe('1234'); // буквы не вводятся
    await ui.click(submit);
    expect(await screen.findByText(/Неверный код\. Проверьте четыре цифры/)).toBeTruthy();

    await ui.clear(field);
    await ui.type(field, '4207');
    await ui.click(screen.getByRole('button', { name: 'Выдать' }));
    expect(await screen.findByText(/Выдано боксов: 3/)).toBeTruthy();
    expect(fake.callsTo('POST /operator/fridges/fridge-1/pickup')[1]!.body).toEqual({
      date: '2026-03-11',
      code: '4207',
    });

    await ui.type(screen.getByLabelText('Код клиента (4 цифры)'), '4207');
    await ui.click(screen.getByRole('button', { name: 'Выдать' }));
    expect(await screen.findByText(/уже был выдан раньше, статус не изменён/)).toBeTruthy();
  });
});

describe('оператор: остаток и закрытие дня (R35, R35.1)', () => {
  const loadedDay = () =>
    dayOverview({
      loaded: true,
      loadedAt: '2026-03-11T05:00:00.000Z',
      orders: [
        {
          id: 'ord-1',
          status: 'loaded',
          boxes: 3,
          items: [{ dishId: 1, qty: 2, name: NAME_A }],
        },
      ],
    });

  it('лишние боксы сверх невыданных заказов: появляется выбор блюда, в запросе остаток, причина и лишние', async () => {
    const closure = {
      closedAt: '2026-03-11T20:30:00.000Z',
      source: 'operator',
      remaining: 5,
      writtenOffOrders: 1,
      writtenOffExtra: 2,
    };
    let closed = false;
    const fake = installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({
        body: closed ? { ...loadedDay(), closure } : loadedDay(),
      }),
      'POST /operator/fridges/fridge-1/close-day': () => {
        closed = true;
        return {
          body: { date: '2026-03-11', fridgeId: 'fridge-1', alreadyClosed: false, closure },
        };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');

    const form = (await screen.findByRole('region', { name: 'Закрытие дня' })) as HTMLElement;
    expect(within(form).queryByLabelText('Блюдо лишних боксов (без заказа)')).toBeNull();
    await ui.type(within(form).getByLabelText('Остаток в холодильнике, боксов'), '5');
    // ждали 3 невыданных бокса, осталось 5: два лишних
    const dish = within(form).getByLabelText('Блюдо лишних боксов (без заказа)');
    await ui.selectOptions(dish, 'Курица с рисом');
    await ui.selectOptions(within(form).getByLabelText('Причина списания невыданных'), 'Просрочка');
    await ui.click(within(form).getByRole('button', { name: 'Закрыть день' }));

    expect(fake.callsTo('POST /operator/fridges/fridge-1/close-day')[0]!.body).toEqual({
      date: '2026-03-11',
      remaining: 5,
      reason: 'expired',
      extras: [{ dishId: 1, qty: 2, reason: 'expired' }],
    });
    expect(await screen.findByText(/День закрыт в 22:30\. Остаток: 5\./)).toBeTruthy();
    expect(screen.getByText(/Списано заказов: 1, боксов без заказа: 2/)).toBeTruthy();
    expect(screen.queryByLabelText('Остаток в холодильнике, боксов')).toBeNull();
  });

  it('день, закрытый системой, показывает автозакрытие', async () => {
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({
        body: {
          ...loadedDay(),
          closure: {
            closedAt: '2026-03-11T21:59:00.000Z',
            source: 'system',
            remaining: null,
            writtenOffOrders: 1,
            writtenOffExtra: 0,
          },
        },
      }),
    });
    renderAt('/admin/operator');
    expect(await screen.findByText(/День закрыт автоматически в 23:59/)).toBeTruthy();
  });

  it('ошибка сервера (окно выдачи ещё идёт) показывается текстом', async () => {
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({ body: loadedDay() }),
      'POST /operator/fridges/fridge-1/close-day': () =>
        apiError(409, 'window_open', 'fulfillment.error.windowOpen', { time: '22:00' }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');
    await ui.type(await screen.findByLabelText('Остаток в холодильнике, боксов'), '3');
    await ui.click(screen.getByRole('button', { name: 'Закрыть день' }));
    expect(await screen.findByText(/Окно выдачи идёт до 22:00/)).toBeTruthy();
  });
});

describe('оператор: температура (R34.1)', () => {
  it('замер вне 0…+5 °C подсвечивается словом и предупреждением; в запросе слот и значение', async () => {
    const fake = installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({
        body: dayOverview({
          temperature: {
            morning: {
              fridgeId: 'fridge-1',
              date: '2026-03-11',
              slot: 'morning',
              celsius: 7.2,
              outOfRange: true,
              recordedAt: '2026-03-11T05:00:00.000Z',
            },
            evening: null,
          },
        }),
      }),
      'POST /operator/fridges/fridge-1/temperature': () => ({
        status: 201,
        body: {
          entry: {
            fridgeId: 'fridge-1',
            date: '2026-03-11',
            slot: 'evening',
            celsius: 7.5,
            outOfRange: true,
            recordedAt: '2026-03-11T17:00:00.000Z',
          },
        },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');

    const card = (await screen.findByRole('region', { name: 'Температура' })) as HTMLElement;
    const hot = within(card).getByText(/Утро: 7\.2 °C/);
    expect(hot.textContent).toMatch(/вне диапазона/);
    expect(hot.className).toContain('operator-temp--out');
    expect(within(card).getByText(/Вечер: не внесён/)).toBeTruthy();

    await ui.selectOptions(within(card).getByLabelText('Замер'), 'Вечер');
    await ui.type(within(card).getByLabelText('Температура, °C'), '7.5');
    await ui.click(within(card).getByRole('button', { name: 'Записать' }));
    expect(fake.callsTo('POST /operator/fridges/fridge-1/temperature')[0]!.body).toEqual({
      slot: 'evening',
      celsius: 7.5,
    });
    expect(await within(card).findByText(/Вне допустимых 0…\+5 °C/)).toBeTruthy();
  });

  it('нормальный замер подтверждается без предупреждения', async () => {
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({ body: dayOverview() }),
      'POST /operator/fridges/fridge-1/temperature': () => ({
        status: 201,
        body: {
          entry: {
            fridgeId: 'fridge-1',
            date: '2026-03-11',
            slot: 'morning',
            celsius: 3,
            outOfRange: false,
            recordedAt: '2026-03-11T05:00:00.000Z',
          },
        },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/operator');
    await ui.type(await screen.findByLabelText('Температура, °C'), '3');
    await ui.click(screen.getByRole('button', { name: 'Записать' }));
    expect(await screen.findByText('Замер записан.')).toBeTruthy();
    expect(screen.queryByText(/Вне допустимых/)).toBeNull();
  });
});

describe('администратор: пропущенные замеры (R34.2) и меню', () => {
  it('список пропусков: дата, замер, зал и холодильник; пустое состояние', async () => {
    let empty = false;
    installFakeApi({
      ...as('admin'),
      'GET /admin/temperature/missed': () => ({
        body: {
          from: '2026-03-05',
          to: '2026-03-11',
          items: empty
            ? []
            : [
                {
                  fridgeId: 'fridge-1',
                  fridgeName: 'Холодильник у входа',
                  gymName: 'Зал «Тест»',
                  date: '2026-03-10',
                  slot: 'evening',
                },
              ],
        },
      }),
    });
    const first = renderAt('/admin/temperature');
    expect(
      await screen.findByText('10.03.2026 · Вечер · Зал «Тест», Холодильник у входа'),
    ).toBeTruthy();
    expect(screen.getByText(/Утренний ждём до 12:00, вечерний до 22:00/)).toBeTruthy();
    first.unmount();
    empty = true;
    renderAt('/admin/temperature');
    expect(await screen.findByText('Пропусков нет.')).toBeTruthy();
  });

  it('оператору страница пропусков недоступна', async () => {
    installFakeApi({ ...as('operator') });
    renderAt('/admin/temperature');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
  });

  it('пункты меню: выдача — оператору и администратору, пропуски температуры — только администратору', () => {
    const labels = (role: 'operator' | 'admin' | 'kitchen' | 'client') =>
      filterNavByRole(nav, role).map((i) => i.to);
    expect(labels('operator')).toEqual(['/admin/operator']);
    expect(labels('admin')).toEqual(['/admin/operator', '/admin/temperature']);
    expect(labels('kitchen')).toEqual([]);
    expect(labels('client')).toEqual([]);
  });

  it('нет нарушений доступности (axe)', async () => {
    installFakeApi({
      ...as('operator'),
      ...fridges,
      'GET /operator/fridges/fridge-1/day': () => ({
        body: dayOverview({ loaded: true, loadedAt: '2026-03-11T05:00:00.000Z' }),
      }),
    });
    const { container } = renderAt('/admin/operator');
    await screen.findByRole('region', { name: 'Закрытие дня' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
