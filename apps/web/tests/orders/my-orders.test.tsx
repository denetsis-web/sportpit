import { configure, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import {
  apiError,
  cleanUp,
  installFakeApi,
  LOT,
  orderApi,
  orderDto,
  renderAt,
} from './fixtures.tsx';

vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 8000 });

afterEach(cleanUp);

const lists = (upcoming: unknown[] = [], past: unknown[] = []) => ({
  'GET /orders': () => ({ body: { upcoming, past } }),
  'GET /pauses': () => ({ body: { items: [] } }),
});

describe('«Мои заказы» (R24, R24.1)', () => {
  it('пустой список: приглашение и кнопка «Выбрать блюда»', async () => {
    installFakeApi(orderApi(lists()));
    renderAt('/orders');
    expect(await screen.findByText('Заказов пока нет')).toBeTruthy();
    const action = screen.getByRole('link', { name: 'Выбрать блюда' });
    expect(action.getAttribute('href')).toBe('/menu');
  });

  it('предстоящие и прошлые заказы: дата, холодильник, блюда, статус и крупный код', async () => {
    installFakeApi(
      orderApi(
        lists(
          [orderDto()],
          [
            orderDto({
              id: 'ord-0',
              status: 'picked_up',
              date: '2026-03-05',
              code: '9027',
              canChange: false,
              items: [
                {
                  dishId: 3,
                  qty: 1,
                  name: { ru: 'Овсянка с ягодами', ro: 'Terci cu fructe' },
                  calories: 350,
                  proteinG: 12,
                  fatG: 8,
                  carbsG: 55,
                  fiberG: 7,
                },
              ],
              boxes: 1,
            }),
            orderDto({
              id: 'ord-x',
              status: 'cancelled',
              code: null,
              canChange: false,
              date: '2026-03-04',
            }),
          ],
        ),
      ),
    );
    renderAt('/orders');
    const upcoming = (await screen.findByRole('heading', { name: 'Предстоящие' })).closest(
      'section',
    )!;
    const card = within(upcoming).getByRole('article', { name: 'Заказ на 11.03.2026' });
    expect(within(card).getByText('Зал «Тест» · Холодильник у входа')).toBeTruthy();
    expect(within(card).getByText('2 × Курица с рисом')).toBeTruthy();
    expect(within(card).getByText('Подтверждён')).toBeTruthy();
    expect(within(card).getByText('4821')).toBeTruthy();
    expect(within(card).getByText('Выдача: 07:00–22:00')).toBeTruthy();

    const past = screen.getByRole('heading', { name: 'Прошлые' }).closest('section')!;
    expect(within(past).getByText('9027')).toBeTruthy();
    expect(within(past).getByText('Выдан')).toBeTruthy();
    expect(within(past).getByText('Отменён')).toBeTruthy();
    // у отменённого заказа кода нет, кнопок отмены у прошлых нет
    expect(within(past).queryByRole('button', { name: /Отменить/ })).toBeNull();
  });

  it('отмена до срока: подтверждение в диалоге, запрос, заказ уходит из предстоящих', async () => {
    const ui = userEvent.setup();
    let cancelled = false;
    const api = installFakeApi(
      orderApi({
        'GET /orders': () => ({
          body: cancelled
            ? {
                upcoming: [],
                past: [orderDto({ status: 'cancelled', code: null, canChange: false })],
              }
            : { upcoming: [orderDto()], past: [] },
        }),
        'GET /pauses': () => ({ body: { items: [] } }),
        'POST /orders/ord-1/cancel': () => {
          cancelled = true;
          return {
            body: { order: orderDto({ status: 'cancelled', code: null, canChange: false }) },
          };
        },
      }),
    );
    renderAt('/orders');
    await ui.click(await screen.findByRole('button', { name: 'Отменить заказ на 11.03.2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Отменить заказ?' });
    expect(within(dialog).getByText('Кредиты вернутся на счёт: 2.')).toBeTruthy();
    await ui.click(within(dialog).getByRole('button', { name: 'Да, отменить' }));

    expect(await screen.findByText('Заказ отменён, кредиты вернулись на счёт.')).toBeTruthy();
    expect(api.callsTo('POST /orders/ord-1/cancel')).toHaveLength(1);
    expect(screen.getByText('Предстоящих заказов нет.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«Не отменять» закрывает окно и ничего не отправляет', async () => {
    const ui = userEvent.setup();
    const api = installFakeApi(orderApi(lists([orderDto()])));
    renderAt('/orders');
    await ui.click(await screen.findByRole('button', { name: 'Отменить заказ на 11.03.2026' }));
    await ui.click(await screen.findByRole('button', { name: 'Не отменять' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo('POST /orders/ord-1/cancel')).toHaveLength(0);
  });

  it('после срока отмена и перенос недоступны, сказано почему; сервер отказал — текст отказа', async () => {
    installFakeApi(orderApi(lists([orderDto({ canChange: false })])));
    renderAt('/orders');
    expect(await screen.findByText('Срок отмены и переноса вышел.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Отменить/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Перенести/ })).toBeNull();
  });

  it('отказ сервера при отмене показан текстом', async () => {
    const ui = userEvent.setup();
    installFakeApi(
      orderApi({
        ...lists([orderDto()]),
        'POST /orders/ord-1/cancel': () =>
          apiError(409, 'cutoff_passed', 'orders.error.cancelCutoff', { time: '18:00' }),
      }),
    );
    renderAt('/orders');
    await ui.click(await screen.findByRole('button', { name: 'Отменить заказ на 11.03.2026' }));
    await ui.click(await screen.findByRole('button', { name: 'Да, отменить' }));
    expect(
      await screen.findByText('Отменить или перенести заказ можно только до 18:00 накануне.'),
    ).toBeTruthy();
  });

  it('«Перенести» ведёт на экран заказа в режиме переноса', async () => {
    installFakeApi(orderApi(lists([orderDto()])));
    renderAt('/orders');
    const link = await screen.findByRole('link', { name: 'Перенести заказ на 11.03.2026' });
    expect(link.getAttribute('href')).toBe('/order?move=ord-1');
  });

  it('срок отмены виден: «до 18:00, 10.03.2026»', async () => {
    installFakeApi(orderApi(lists([orderDto()])));
    renderAt('/orders');
    expect(
      await screen.findByText('Отменить или перенести можно до 18:00, 10.03.2026.'),
    ).toBeTruthy();
  });

  it('по-румынски: заголовки и пустое состояние', async () => {
    installFakeApi(orderApi(lists()));
    renderAt('/orders', 'ro');
    expect(await screen.findByText('Încă nu aveți comenzi')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alege preparate' })).toBeTruthy();
  });

  it('axe: без критических нарушений', async () => {
    installFakeApi(
      orderApi(
        lists([orderDto()], [orderDto({ id: 'ord-0', status: 'picked_up', canChange: false })]),
      ),
    );
    const { container } = renderAt('/orders');
    await screen.findByRole('heading', { name: 'Предстоящие' });
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('пауза пакета (R27.1)', () => {
  const credits = { 'GET /credits': () => ({ body: { balance: 10, lots: [LOT] } }) };

  it('показывает пакеты с кредитами и отправляет паузу: лот, первый день, число дней', async () => {
    const ui = userEvent.setup();
    const api = installFakeApi(
      orderApi({
        ...lists(),
        ...credits,
        'POST /pauses': () => ({
          status: 201,
          body: {
            pause: {
              lotId: 7,
              from: '2026-03-12',
              until: '2026-03-16',
              days: 5,
              expiresAt: '2026-04-20T09:00:00.000Z',
              previousExpiresAt: LOT.expiresAt,
            },
          },
        }),
      }),
    );
    renderAt('/orders');
    const section = (await screen.findByRole('heading', { name: 'Пауза пакета' })).closest(
      'section',
    )!;
    expect(within(section).getByText('Кредитов: 10, срок до 15.04.2026')).toBeTruthy();

    await ui.clear(within(section).getByLabelText('Дней паузы (1–14)'));
    await ui.type(within(section).getByLabelText('Дней паузы (1–14)'), '5');
    fireEvent.change(within(section).getByLabelText('Первый день паузы'), {
      target: { value: '2026-03-12' },
    });
    await ui.click(
      within(section).getByRole('button', {
        name: 'Поставить на паузу пакет со сроком до 15.04.2026',
      }),
    );

    expect(
      await screen.findByText('Пауза с 12.03.2026 по 16.03.2026. Новый срок кредитов: 20.04.2026.'),
    ).toBeTruthy();
    expect(api.callsTo('POST /pauses')[0]!.body).toEqual({ lotId: 7, from: '2026-03-12', days: 5 });
  });

  it('уже стоящая пауза показана, повторно поставить нельзя', async () => {
    installFakeApi(
      orderApi({
        ...lists(),
        ...credits,
        'GET /pauses': () => ({
          body: {
            items: [
              {
                lotId: 7,
                from: '2026-03-12',
                until: '2026-03-16',
                days: 5,
                expiresAt: '2026-04-20T09:00:00.000Z',
                previousExpiresAt: LOT.expiresAt,
              },
            ],
          },
        }),
      }),
    );
    renderAt('/orders');
    expect(
      await screen.findByText(
        'Пауза с 12.03.2026 по 16.03.2026, срок кредитов теперь до 20.04.2026.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Поставить на паузу/ })).toBeNull();
  });

  it('есть заказы на дни паузы: отказ сервера показан текстом', async () => {
    const ui = userEvent.setup();
    installFakeApi(
      orderApi({
        ...lists(),
        ...credits,
        'POST /pauses': () => apiError(409, 'pause_has_orders', 'orders.error.pauseHasOrders'),
      }),
    );
    renderAt('/orders');
    await ui.click(
      await screen.findByRole('button', {
        name: 'Поставить на паузу пакет со сроком до 15.04.2026',
      }),
    );
    expect(
      await screen.findByText(
        'На дни паузы есть подтверждённые заказы. Отмените их или выберите другие дни.',
      ),
    ).toBeTruthy();
  });

  it('нет пакетов с кредитами: пояснение вместо формы', async () => {
    installFakeApi(
      orderApi({ ...lists(), 'GET /credits': () => ({ body: { balance: 0, lots: [] } }) }),
    );
    renderAt('/orders');
    expect(
      await screen.findByText('Нет пакетов с кредитами, которые можно поставить на паузу.'),
    ).toBeTruthy();
  });
});
