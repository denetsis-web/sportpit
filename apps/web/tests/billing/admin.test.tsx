import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { formatLeiInput, parseLei } from '../../src/features/admin/packages/lei.ts';
import { apiError } from '../auth/fakeApi.ts';
import { cleanUp, installFakeApi, loggedIn, PACKAGES, renderAt } from './render.tsx';

afterEach(cleanUp);

describe('лей ⇄ бани в полях админки', () => {
  it.each([
    ['119', 11900],
    ['119,50', 11950],
    ['119.5', 11950],
    ['0,05', 5],
    [' 99 ', 9900],
  ])('«%s» → %i бань', (text, bani) => {
    expect(parseLei(text)).toBe(bani);
  });

  it.each(['', 'abc', '12,345', '-5', '1 000', '1e3'])('«%s» не число', (text) => {
    expect(parseLei(text)).toBeNull();
  });

  it('обратное преобразование', () => {
    expect(formatLeiInput(11900)).toBe('119');
    expect(formatLeiInput(11950)).toBe('119,50');
    expect(formatLeiInput(5)).toBe('0,05');
  });
});

describe('админка: пакеты и цены', () => {
  const adminApi = (extra = {}) => ({
    ...loggedIn('admin'),
    'GET /admin/packages': () => ({ body: { items: PACKAGES } }),
    ...extra,
  });

  it('цена вводится в леях, на сервер уходит в баных', async () => {
    const api = installFakeApi(
      adminApi({
        'PATCH /admin/packages/1': () => ({
          body: { package: { ...PACKAGES[0], pricePerBoxBani: 12050 } },
        }),
      }),
    );
    const ui = userEvent.setup();
    renderAt('/admin/packages');

    const price = (await screen.findByLabelText('Цена за бокс, лей', {
      selector: '#package-1-price',
    })) as HTMLInputElement;
    expect(price.value).toBe('119');
    await ui.clear(price);
    await ui.type(price, '120,50');
    const form = price.closest('form')!;
    await ui.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Сохранено.')).toBeTruthy();
    expect(api.callsTo('PATCH /admin/packages/1')[0]!.body).toEqual({
      boxes: 12,
      pricePerBoxBani: 12050,
      sortOrder: 10,
      active: true,
    });
  });

  it('новый пакет создаётся, неверная цена блокирует кнопку', async () => {
    const api = installFakeApi(
      adminApi({
        'POST /admin/packages': () => ({
          status: 201,
          body: { package: { ...PACKAGES[0], id: 9, boxes: 8 } },
        }),
      }),
    );
    const ui = userEvent.setup();
    renderAt('/admin/packages');

    await screen.findByRole('heading', { name: 'Новый пакет' });
    await ui.type(document.querySelector<HTMLInputElement>('#package-new-boxes')!, '8');
    const add = screen.getByRole('button', { name: 'Добавить пакет' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    await ui.type(document.querySelector<HTMLInputElement>('#package-new-price')!, '125');
    await ui.click(add);

    await screen.findByRole('heading', { name: 'Пакет на 12 боксов' });
    expect(api.callsTo('POST /admin/packages')[0]!.body).toMatchObject({
      boxes: 8,
      pricePerBoxBani: 12500,
    });
  });

  it('клиент видит «Нет доступа», запросов к админским данным нет', async () => {
    const api = installFakeApi({ ...loggedIn('client') });
    renderAt('/admin/packages');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(api.callsTo('GET /admin/packages')).toHaveLength(0);
  });

  it('нет нарушений доступности', async () => {
    installFakeApi(adminApi());
    const { container } = renderAt('/admin/packages');
    await screen.findByRole('heading', { name: 'Пакет на 12 боксов' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('админка: промокоды', () => {
  const promo = {
    id: 1,
    code: 'FIT15',
    kind: 'percent',
    value: 15,
    ownerLabel: 'Тренер Анна',
    validFrom: null,
    validUntil: '2026-06-30',
    maxUses: 50,
    oncePerUser: true,
    active: true,
    usedCount: 3,
  };

  it('показывает промокоды с числом использований и выключает код', async () => {
    let current = promo;
    const api = installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/promos': () => ({ body: { items: [current] } }),
      'PATCH /admin/promos/1': () => {
        current = { ...current, active: false };
        return { body: { promo: current } };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/promos');

    expect(await screen.findByRole('heading', { name: 'FIT15' })).toBeTruthy();
    expect(screen.getByText('Использован: 3 / 50')).toBeTruthy();
    expect(screen.getByText(/Скидка в процентах: 15%/)).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Выключить FIT15' }));

    expect(await screen.findByRole('button', { name: 'Включить FIT15' })).toBeTruthy();
    expect(api.callsTo('PATCH /admin/promos/1')[0]!.body).toEqual({ active: false });
  });

  it('создаёт промокод на фиксированную сумму: лей → бани, пустые поля → null', async () => {
    const api = installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/promos': () => ({ body: { items: [] } }),
      'POST /admin/promos': () => ({
        status: 201,
        body: { promo: { ...promo, kind: 'fixed', value: 5000 } },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/promos');

    await ui.type(await screen.findByLabelText('Код'), 'MINUS50');
    await ui.selectOptions(screen.getByLabelText('Тип'), 'fixed');
    await ui.type(screen.getByLabelText('Скидка, лей'), '50');
    await ui.click(screen.getByRole('button', { name: 'Создать промокод' }));

    expect(await screen.findByText('Промокод создан.')).toBeTruthy();
    expect(api.callsTo('POST /admin/promos')[0]!.body).toEqual({
      code: 'MINUS50',
      kind: 'fixed',
      value: 5000,
      ownerLabel: null,
      validFrom: null,
      validUntil: null,
      maxUses: null,
      oncePerUser: true,
    });
  });

  it('ошибки сервера по полям показываются на русском', async () => {
    installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/promos': () => ({ body: { items: [] } }),
      'POST /admin/promos': () =>
        apiError(400, 'validation_failed', 'core.error.validation', undefined, {
          value: 'billing.error.promoValue',
        }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/promos');
    await ui.type(await screen.findByLabelText('Код'), 'BIG');
    await ui.type(screen.getByLabelText('Процент скидки (1–100)'), '150');
    await ui.click(screen.getByRole('button', { name: 'Создать промокод' }));
    expect(
      (await screen.findAllByText('Значение не подходит для этого типа промокода.')).length,
    ).toBeGreaterThan(0);
  });
});

describe('админка: возвраты', () => {
  const paid = {
    id: 5,
    status: 'paid',
    failureCode: null,
    failureReason: null,
    packageId: 1,
    boxes: 12,
    listPricePerBoxBani: 11900,
    unitPriceBani: 11900,
    discountBani: 0,
    totalBani: 142800,
    promoCode: null,
    method: 'card',
    redirectUrl: null,
    stubGateway: true,
    createdAt: '2026-03-10T09:00:00.000Z',
    paidAt: '2026-03-10T09:01:00.000Z',
    expiresAt: '2026-04-24T09:01:00.000Z',
    carriedOver: 0,
    userId: 2,
    userPhone: '+37369876543',
    unusedCredits: 10,
    refundableBani: 119000,
    refundedBani: 0,
  };

  it('показывает сумму возврата по кредитам и отправляет причину', async () => {
    const api = installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/purchases': () => ({ body: { items: [paid] } }),
      'GET /admin/refunds': () => ({ body: { items: [] } }),
      'POST /admin/refunds': () => ({
        status: 201,
        body: {
          refund: {
            id: 1,
            purchaseId: 5,
            userId: 2,
            userPhone: '+37369876543',
            credits: 4,
            amountBani: 47600,
            reason: 'часть боксов не нужна',
            status: 'done',
            failureDetail: null,
            createdAt: '2026-03-10T10:00:00.000Z',
          },
        },
      }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/refunds');

    expect(await screen.findByText(/Покупка №5, \+37369876543: боксов 12/)).toBeTruthy();
    expect(screen.getByText('Неиспользовано: 10')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Оформить возврат' }));
    const credits = screen.getByLabelText('Сколько кредитов вернуть');
    await ui.clear(credits);
    await ui.type(credits, '4');
    await ui.type(screen.getByLabelText('Причина возврата'), 'часть боксов не нужна');

    expect(screen.getByText(/Сумма возврата: 476 лей/)).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Вернуть деньги' }));

    expect(await screen.findByText('Возврат оформлен.')).toBeTruthy();
    expect(api.callsTo('POST /admin/refunds')[0]!.body).toEqual({
      purchaseId: 5,
      credits: 4,
      reason: 'часть боксов не нужна',
    });
  });

  it('нельзя вернуть больше неиспользованного и без причины', async () => {
    installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/purchases': () => ({ body: { items: [paid] } }),
      'GET /admin/refunds': () => ({ body: { items: [] } }),
    });
    const ui = userEvent.setup();
    renderAt('/admin/refunds');
    await ui.click(await screen.findByRole('button', { name: 'Оформить возврат' }));
    const submit = screen.getByRole('button', { name: 'Вернуть деньги' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // причины нет
    await ui.type(screen.getByLabelText('Причина возврата'), 'ошибка');
    expect(submit.disabled).toBe(false);
    const credits = screen.getByLabelText('Сколько кредитов вернуть');
    await ui.clear(credits);
    await ui.type(credits, '11');
    expect(submit.disabled).toBe(true);
  });

  it('возврат, ожидающий шлюз, можно повторить', async () => {
    let status: 'pending' | 'done' = 'pending';
    const api = installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/purchases': () => ({ body: { items: [] } }),
      'GET /admin/refunds': () => ({
        body: {
          items: [
            {
              id: 3,
              purchaseId: 5,
              userId: 2,
              userPhone: null,
              credits: 2,
              amountBani: 23800,
              reason: 'ошибка',
              status,
              failureDetail: null,
              createdAt: '2026-03-10T10:00:00.000Z',
            },
          ],
        },
      }),
      'POST /admin/refunds/3/retry': () => {
        status = 'done';
        return {
          body: {
            refund: {
              id: 3,
              purchaseId: 5,
              userId: 2,
              userPhone: null,
              credits: 2,
              amountBani: 23800,
              reason: 'ошибка',
              status,
              failureDetail: null,
              createdAt: '2026-03-10T10:00:00.000Z',
            },
          },
        };
      },
    });
    const ui = userEvent.setup();
    renderAt('/admin/refunds');

    await ui.click(await screen.findByRole('button', { name: 'Повторить для возврата №3' }));

    expect(await screen.findByText('Выполнен')).toBeTruthy();
    expect(api.callsTo('POST /admin/refunds/3/retry')).toHaveLength(1);
  });

  it('нет нарушений доступности', async () => {
    installFakeApi({
      ...loggedIn('admin'),
      'GET /admin/purchases': () => ({ body: { items: [paid] } }),
      'GET /admin/refunds': () => ({ body: { items: [] } }),
    });
    const { container } = renderAt('/admin/refunds');
    await screen.findByText('Неиспользовано: 10');
    expect(await axe(container)).toHaveNoViolations();
  });
});
