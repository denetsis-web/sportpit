import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError } from '../auth/fakeApi.ts';
import { baseBilling, cleanUp, installFakeApi, purchase, renderAt } from './render.tsx';

afterEach(cleanUp);

const lots = [
  {
    id: 1,
    source: 'purchase',
    remaining: 5,
    unitPriceBani: 11900,
    createdAt: '2026-03-01T09:00:00.000Z',
    expiresAt: '2026-04-15T09:00:00.000Z',
  },
];

describe('экран «Пакеты»', () => {
  it('показывает пакеты с ценой за бокс, суммой и сроком; цены в лей', async () => {
    installFakeApi(baseBilling());
    renderAt('/packages');

    const card = (await screen.findByRole('heading', { name: 'Пакет: 12' })).closest('section')!;
    const text = card.textContent!.replace(/\s/g, ' ');
    expect(text).toContain('За бокс: 119 лей');
    expect(text).toContain('Итого: 1 428 лей');
    expect(text).toContain('Действует 45 дн. с оплаты');
    const single = (await screen.findByRole('heading', { name: 'Разовый бокс' })).closest(
      'section',
    )!;
    expect(single.textContent!.replace(/\s/g, ' ')).toContain('За бокс: 129 лей');
    expect(screen.getByRole('heading', { name: 'Пакет: 20' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Пакет: 30' })).toBeTruthy();
  });

  it('показывает баланс и срок действия лотов; без кредитов — подсказку', async () => {
    installFakeApi(baseBilling({ balance: 5, lots }));
    renderAt('/packages');
    expect(await screen.findByText('Доступно кредитов: 5')).toBeTruthy();
    expect(screen.getByText('Сгорят 15.04.2026: 5')).toBeTruthy();
  });

  it('пустой баланс: понятная подсказка', async () => {
    installFakeApi(baseBilling());
    renderAt('/packages');
    expect(await screen.findByText('Кредитов пока нет. Выберите пакет ниже.')).toBeTruthy();
  });

  it('по-румынски: тексты и деньги в lei', async () => {
    installFakeApi(baseBilling());
    renderAt('/packages', 'ro');
    expect(await screen.findByRole('heading', { name: 'Pachete de boxuri' })).toBeTruthy();
    const card = screen.getByRole('heading', { name: 'Pachet: 12' }).closest('section')!;
    expect(card.textContent!.replace(/\s/g, ' ')).toContain('Pe box: 119 lei');
  });

  it('«Купить» отправляет пакет, способ и ключ попытки и ведёт на страницу шлюза', async () => {
    const created = purchase();
    const api = installFakeApi({
      ...baseBilling(),
      'POST /purchases': () => ({ status: 201, body: { purchase: created } }),
      'GET /purchases/7': () => ({ body: { purchase: created } }),
    });
    const ui = userEvent.setup();
    renderAt('/packages');

    await ui.click(await screen.findByRole('button', { name: /^Купить/ }));

    expect(await screen.findByRole('button', { name: 'Оплатить' })).toBeTruthy();
    const [call] = api.callsTo('POST /purchases');
    expect(call!.body).toMatchObject({ packageId: 1, method: 'card' });
    expect((call!.body as { idempotencyKey: string }).idempotencyKey.length).toBeGreaterThanOrEqual(
      8,
    );
  });

  it('другой пакет и MIA уходят в запросе; двойное нажатие даёт один запрос', async () => {
    const created = purchase({ packageId: 2, boxes: 20, method: 'mia' });
    const api = installFakeApi({
      ...baseBilling(),
      'POST /purchases': async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { status: 201, body: { purchase: created } };
      },
      'GET /purchases/7': () => ({ body: { purchase: created } }),
    });
    const ui = userEvent.setup();
    renderAt('/packages');

    const twenty = (await screen.findByRole('heading', { name: 'Пакет: 20' })).closest('section')!;
    await ui.click(within(twenty).getByRole('button', { name: 'Выбрать' }));
    await ui.click(screen.getByRole('radio', { name: 'MIA' }));
    const buy = screen.getByRole('button', { name: /^Купить/ });
    await ui.dblClick(buy);

    await screen.findByRole('button', { name: 'Оплатить' });
    expect(api.callsTo('POST /purchases')).toHaveLength(1);
    expect(api.callsTo('POST /purchases')[0]!.body).toMatchObject({ packageId: 2, method: 'mia' });
  });

  it('промокод на скидку: сервер считает итог, в покупку уходит код', async () => {
    const api = installFakeApi({
      ...baseBilling(),
      'POST /promo/apply': () => ({
        body: {
          code: 'FIT15',
          kind: 'percent',
          discountBani: 21420,
          totalBani: 121380,
          unitPriceBani: 10115,
          creditsGranted: 0,
        },
      }),
      'POST /purchases': () => ({
        status: 201,
        body: { purchase: purchase({ promoCode: 'FIT15' }) },
      }),
      'GET /purchases/7': () => ({ body: { purchase: purchase() } }),
    });
    const ui = userEvent.setup();
    renderAt('/packages');

    await ui.type(await screen.findByLabelText('Промокод'), 'fit15');
    await ui.click(screen.getByRole('button', { name: 'Применить' }));

    expect(
      (await screen.findAllByText(/Промокод FIT15 применён: скидка 214,20 лей/))[0],
    ).toBeTruthy();
    expect(screen.getByText(/Итого со скидкой: 1 213,80 лей/)).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: /^Купить/ }));
    await screen.findByRole('button', { name: 'Оплатить' });
    expect(api.callsTo('POST /purchases')[0]!.body).toMatchObject({ promoCode: 'FIT15' });
  });

  it('бесплатные кредиты: сообщение и обновлённый баланс', async () => {
    let balance = 0;
    installFakeApi({
      ...baseBilling(),
      'GET /credits': () => ({
        body: { balance, lots: balance ? lots.map((l) => ({ ...l, remaining: balance })) : [] },
      }),
      'POST /promo/apply': () => {
        balance = 3;
        return {
          body: {
            code: 'TRIAL3',
            kind: 'free_credits',
            discountBani: 0,
            totalBani: null,
            unitPriceBani: null,
            creditsGranted: 3,
          },
        };
      },
    });
    const ui = userEvent.setup();
    renderAt('/packages');

    await ui.type(await screen.findByLabelText('Промокод'), 'TRIAL3');
    await ui.click(screen.getByRole('button', { name: 'Применить' }));

    expect(
      await screen.findByText('Промокод TRIAL3: на счёт зачислено кредитов — 3.'),
    ).toBeTruthy();
    expect(await screen.findByText('Доступно кредитов: 3')).toBeTruthy();
  });

  it('ошибка промокода показывается на языке интерфейса, поле остаётся', async () => {
    installFakeApi({
      ...baseBilling(),
      'POST /promo/apply': () =>
        apiError(400, 'promo_expired', 'billing.error.promoExpired', { date: '2026-03-01' }),
    });
    const ui = userEvent.setup();
    renderAt('/packages');
    const field = (await screen.findByLabelText('Промокод')) as HTMLInputElement;
    await ui.type(field, 'OLD');
    await ui.click(screen.getByRole('button', { name: 'Применить' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Срок действия промокода закончился 2026-03-01.',
    );
    expect(field.value).toBe('OLD');
  });

  it('ошибка покупки видна; после отказа сервера следующая попытка идёт с новым ключом', async () => {
    let attempt = 0;
    const api = installFakeApi({
      ...baseBilling(),
      'POST /purchases': () => {
        attempt += 1;
        return attempt === 1
          ? apiError(404, 'package_unavailable', 'billing.error.packageUnavailable')
          : { status: 201, body: { purchase: purchase() } };
      },
      'GET /purchases/7': () => ({ body: { purchase: purchase() } }),
    });
    const ui = userEvent.setup();
    renderAt('/packages');

    await ui.click(await screen.findByRole('button', { name: /^Купить/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('Этот пакет сейчас не продаётся.');

    await ui.click(screen.getByRole('button', { name: /^Купить/ }));
    await screen.findByRole('button', { name: 'Оплатить' });
    const keys = api
      .callsTo('POST /purchases')
      .map((c) => (c.body as { idempotencyKey: string }).idempotencyKey);
    // отказ сервера — решение окончательное: новая попытка, новый ключ
    expect(new Set(keys).size).toBe(2);
  });

  it('нет связи: повтор идёт с тем же ключом, чтобы не создать вторую покупку', async () => {
    let attempt = 0;
    const api = installFakeApi({
      ...baseBilling(),
      'POST /purchases': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return { status: 200, body: { purchase: purchase() } };
      },
      'GET /purchases/7': () => ({ body: { purchase: purchase() } }),
    });
    const ui = userEvent.setup();
    renderAt('/packages');

    await ui.click(await screen.findByRole('button', { name: /^Купить/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Нет связи с сервером. Проверьте интернет и повторите.',
    );
    await ui.click(screen.getByRole('button', { name: /^Купить/ }));
    await screen.findByRole('button', { name: 'Оплатить' });

    const keys = api
      .callsTo('POST /purchases')
      .map((c) => (c.body as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('данные карты не запрашиваются: полей карты нет, есть пояснение', async () => {
    installFakeApi(baseBilling());
    const { container } = renderAt('/packages');
    await screen.findByRole('heading', { name: 'Пакет: 12' });
    expect(container.querySelector('input[autocomplete^="cc-"]')).toBeNull();
    expect(container.querySelector('input[name*="card" i], input[name*="cvv" i]')).toBeNull();
    expect(
      screen.getByText(
        'Данные карты вводятся только на странице платёжного шлюза: приложение их не принимает и не хранит.',
      ),
    ).toBeTruthy();
  });

  it('вошедший не нужен: гость отправляется на вход', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderAt('/packages');
    await waitFor(() => expect(screen.getByLabelText(/Номер телефона/)).toBeTruthy());
  });

  it('нет нарушений доступности', async () => {
    installFakeApi(baseBilling({ balance: 5, lots }));
    const { container } = renderAt('/packages');
    await screen.findByRole('heading', { name: 'Пакет: 12' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
