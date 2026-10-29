import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { POLL_MS } from '../../src/features/client/payment/PayStatusPage.tsx';
import { baseBilling, cleanUp, installFakeApi, loggedIn, purchase, renderAt } from './render.tsx';

afterEach(cleanUp);

describe('экран статуса оплаты', () => {
  it('сам обновляется: ожидание → оплачено без перезагрузки страницы', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = purchase();
    const api = installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({ body: { purchase: current } }),
    });
    renderAt('/pay/7');

    expect(await screen.findByText('Ждём подтверждения оплаты')).toBeTruthy();

    current = purchase({
      status: 'paid',
      redirectUrl: null,
      paidAt: '2026-03-10T09:01:00.000Z',
      expiresAt: '2026-04-24T09:01:00.000Z',
      carriedOver: 2,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS + 100);
    });

    expect(await screen.findByText('Оплата прошла')).toBeTruthy();
    expect(screen.getByText('Кредитов зачислено: 14. Они действуют до 24.04.2026.')).toBeTruthy();
    expect(screen.getByText('Перенесено из сгоревших кредитов: 2.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Выбрать блюда' }).getAttribute('href')).toBe('/menu');

    // после финального статуса опрос прекращается
    const calls = api.callsTo('GET /purchases/7').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(api.callsTo('GET /purchases/7')).toHaveLength(calls);
  });

  it('отказ: причина видна, кредитов нет, повтор ведёт к выбору того же пакета', async () => {
    installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({
        body: {
          purchase: purchase({
            status: 'failed',
            failureCode: 'declined',
            failureReason: 'Недостаточно средств',
            redirectUrl: null,
            packageId: 2,
          }),
        },
      }),
    });
    renderAt('/pay/7');

    expect(await screen.findByText('Оплата не прошла')).toBeTruthy();
    expect(
      screen.getByText(/Банк отклонил платёж\. Деньги не списаны, кредиты не зачислены\./),
    ).toBeTruthy();
    expect(screen.getByText('Ответ шлюза: Недостаточно средств')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Повторить оплату' }).getAttribute('href')).toBe(
      '/packages?package=2',
    );
  });

  it.each([
    ['cancelled', 'Оплата отменена'],
    ['expired', 'Время ожидания оплаты истекло'],
    ['error', 'Платёжный сервис временно недоступен'],
  ])('причина %s объяснена по-русски', async (code, phrase) => {
    installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({
        body: {
          purchase: purchase({
            status: 'failed',
            failureCode: code as 'expired',
            redirectUrl: null,
          }),
        },
      }),
    });
    renderAt('/pay/7');
    expect((await screen.findByText(new RegExp(phrase))).textContent).toContain(phrase);
  });

  it('по-румынски', async () => {
    installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({
        body: {
          purchase: purchase({ status: 'failed', failureCode: 'declined', redirectUrl: null }),
        },
      }),
    });
    renderAt('/pay/7', 'ro');
    expect(await screen.findByText('Plata nu a reușit')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Repetă plata' })).toBeTruthy();
  });

  it('«Отменить оплату» отправляет отмену и показывает итог', async () => {
    const api = installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({ body: { purchase: purchase() } }),
      'POST /purchases/7/cancel': () => ({
        body: {
          purchase: purchase({ status: 'failed', failureCode: 'cancelled', redirectUrl: null }),
        },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/pay/7');

    await ui.click(await screen.findByRole('button', { name: 'Отменить оплату' }));

    expect(await screen.findByText(/Оплата отменена/)).toBeTruthy();
    expect(api.callsTo('POST /purchases/7/cancel')).toHaveLength(1);
  });

  it('нет доступности нарушений на экране статуса', async () => {
    installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({ body: { purchase: purchase() } }),
    });
    const { container } = renderAt('/pay/7');
    await screen.findByText('Ждём подтверждения оплаты');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('страница заглушки шлюза /pay/stub/:id', () => {
  it('«Оплатить» отправляет результат и ведёт на экран статуса', async () => {
    let current = purchase();
    const api = installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({ body: { purchase: current } }),
      'POST /purchases/7/stub-pay': () => {
        current = purchase({
          status: 'paid',
          redirectUrl: null,
          expiresAt: '2026-04-24T09:00:00.000Z',
        });
        return { body: { purchase: current } };
      },
    });
    const ui = userEvent.setup();
    renderAt('/pay/stub/7');

    expect(await screen.findByText(/К оплате: 1 428 лей/)).toBeTruthy();
    expect(screen.getByText(/данные карты здесь не нужны/)).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Оплатить' }));

    expect(await screen.findByText('Оплата прошла')).toBeTruthy();
    expect(api.callsTo('POST /purchases/7/stub-pay')[0]!.body).toEqual({ outcome: 'paid' });
  });

  it('«Отклонить» отправляет отказ и показывает причину', async () => {
    let current = purchase();
    const api = installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({ body: { purchase: current } }),
      'POST /purchases/7/stub-pay': () => {
        current = purchase({ status: 'failed', failureCode: 'declined', redirectUrl: null });
        return { body: { purchase: current } };
      },
    });
    const ui = userEvent.setup();
    renderAt('/pay/stub/7');

    await ui.click(await screen.findByRole('button', { name: 'Отклонить' }));

    expect(await screen.findByText('Оплата не прошла')).toBeTruthy();
    expect(api.callsTo('POST /purchases/7/stub-pay')[0]!.body).toEqual({ outcome: 'failed' });
  });

  it('с настоящим шлюзом тестовая страница недоступна, кнопок нет', async () => {
    installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({ body: { purchase: purchase({ stubGateway: false }) } }),
    });
    renderAt('/pay/stub/7');
    expect(await screen.findByText(/Тестовая страница недоступна/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Оплатить' })).toBeNull();
  });

  it('уже оплаченную покупку страница заглушки отправляет на экран статуса', async () => {
    installFakeApi({
      ...loggedIn(),
      'GET /purchases/7': () => ({
        body: { purchase: purchase({ status: 'paid', redirectUrl: null }) },
      }),
    });
    renderAt('/pay/stub/7');
    expect(await screen.findByText('Оплата прошла')).toBeTruthy();
  });
});

describe('путь «вход → пакет → оплата» в интерфейсе (R09)', () => {
  it('занимает не более 8 действий клиента после ввода кода', async () => {
    let current: ReturnType<typeof purchase> | null = null;
    let balance = 0;
    installFakeApi({
      ...baseBilling(),
      'GET /credits': () => ({
        body: {
          balance,
          lots: balance
            ? [
                {
                  id: 1,
                  source: 'purchase',
                  remaining: balance,
                  unitPriceBani: 11900,
                  createdAt: '2026-03-10T09:00:00.000Z',
                  expiresAt: '2026-04-24T09:00:00.000Z',
                },
              ]
            : [],
        },
      }),
      'POST /purchases': () => {
        current = purchase();
        return { status: 201, body: { purchase: current } };
      },
      'GET /purchases/7': () => ({ body: { purchase: current! } }),
      'POST /purchases/7/stub-pay': () => {
        current = purchase({
          status: 'paid',
          redirectUrl: null,
          expiresAt: '2026-04-24T09:00:00.000Z',
        });
        balance = 12;
        return { body: { purchase: current } };
      },
    });
    const ui = userEvent.setup();
    let actions = 0;
    const act1 = async (element: HTMLElement) => {
      actions += 1;
      await ui.click(element);
    };

    renderAt('/packages'); // действие 1: открыть «Пакеты» (пункт меню)
    actions += 1;
    await act1(await screen.findByRole('button', { name: /^Купить/ })); // 2: «Купить» (пакет на 12 выбран сам)
    await act1(await screen.findByRole('button', { name: 'Оплатить' })); // 3: «Оплатить» на странице шлюза
    expect(await screen.findByText('Оплата прошла')).toBeTruthy();
    await act1(screen.getByRole('link', { name: 'К пакетам' })); // 4: вернуться и увидеть баланс
    expect(await screen.findByText('Доступно кредитов: 12')).toBeTruthy();

    expect(actions).toBeLessThanOrEqual(8);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Пакеты боксов' })).toBeTruthy(),
    );
  });
});
