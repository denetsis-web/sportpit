import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError, cleanUp, installFakeApi, pickupView, renderAt, user } from './fixtures.tsx';

afterEach(cleanUp);

const me = { 'GET /auth/me': () => ({ body: { user: user({ role: 'client' }) } }) };

describe('получение бокса клиентом (R25, R34.3, R45)', () => {
  it('показывает код крупно, QR, код замка и кнопку «Забрал» в окно выдачи', async () => {
    installFakeApi({
      ...me,
      'GET /pickup/orders': () => ({ body: { items: [pickupView({ accessCode: '4821' })] } }),
    });
    renderAt('/pickup');
    expect((await screen.findByTestId('pickup-code')).textContent).toBe('4207');
    expect(
      await screen.findByRole('img', { name: /QR-код заказа с кодом получения 4207/ }),
    ).toBeTruthy();
    expect(screen.getByTestId('pickup-lock').textContent).toBe('4821');
    expect(screen.getByText('Код замка холодильника')).toBeTruthy();
    expect(screen.getByText('Окно выдачи: 07:00–22:00')).toBeTruthy();
    expect(screen.getByText('2 × Курица с рисом')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Забрал заказ на/ })).toBeTruthy();
  });

  it('до загрузки кнопки нет, причина объяснена; кода замка нет, код получения виден', async () => {
    installFakeApi({
      ...me,
      'GET /pickup/orders': () => ({
        body: {
          items: [
            pickupView({
              status: 'confirmed',
              loaded: false,
              canPickup: false,
              blockedReason: 'not_loaded',
            }),
          ],
        },
      }),
    });
    renderAt('/pickup');
    expect((await screen.findByTestId('pickup-blocked')).textContent).toMatch(/ещё не загружен/);
    expect(screen.queryByRole('button', { name: /Забрал/ })).toBeNull();
    expect(screen.queryByTestId('pickup-lock')).toBeNull();
    expect(screen.getByTestId('pickup-code').textContent).toBe('4207');
  });

  it('вне окна выдачи: объяснение с границей окна и без кнопки', async () => {
    installFakeApi({
      ...me,
      'GET /pickup/orders': () => ({
        body: { items: [pickupView({ canPickup: false, blockedReason: 'before_window' })] },
      }),
    });
    renderAt('/pickup');
    expect(await screen.findByText(/Окно выдачи ещё не открылось: с 07:00/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Забрал/ })).toBeNull();
  });

  it('«Забрал» отправляет запрос, затем показывает «Выдан»', async () => {
    let picked = false;
    const done = pickupView({ status: 'picked_up', canPickup: false, blockedReason: 'picked_up' });
    const fake = installFakeApi({
      ...me,
      'GET /pickup/orders': () => ({ body: { items: [picked ? done : pickupView()] } }),
      'POST /pickup/orders/ord-1/pickup': () => {
        picked = true;
        return { body: { alreadyPickedUp: false, order: done } };
      },
    });
    const ui = userEvent.setup();
    renderAt('/pickup');
    await ui.click(await screen.findByRole('button', { name: /Забрал заказ на/ }));
    expect(fake.callsTo('POST /pickup/orders/ord-1/pickup')).toHaveLength(1);
    expect(await screen.findByText('Заказ выдан. Приятного аппетита!')).toBeTruthy();
    expect(await screen.findByText('Заказ выдан.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Забрал заказ на/ })).toBeNull();
  });

  it('ошибка сервера при нажатии показывается на языке интерфейса', async () => {
    installFakeApi({
      ...me,
      'GET /pickup/orders': () => ({ body: { items: [pickupView()] } }),
      'POST /pickup/orders/ord-1/pickup': () =>
        apiError(409, 'window_closed', 'fulfillment.error.window', { from: '07:00', to: '22:00' }),
    });
    const ui = userEvent.setup();
    renderAt('/pickup');
    await ui.click(await screen.findByRole('button', { name: /Забрал заказ на/ }));
    expect(await screen.findByText(/Забрать бокс можно с 07:00 до 22:00/)).toBeTruthy();
  });

  it('пустое состояние: на сегодня заказов нет, есть ссылка на «Мои заказы»', async () => {
    installFakeApi({ ...me, 'GET /pickup/orders': () => ({ body: { items: [] } }) });
    renderAt('/pickup');
    expect(await screen.findByText('На сегодня заказов нет.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Мои заказы' }).getAttribute('href')).toBe('/orders');
  });

  it('на румынском: подписи и кнопка', async () => {
    installFakeApi({ ...me, 'GET /pickup/orders': () => ({ body: { items: [pickupView()] } }) });
    renderAt('/pickup', 'ro');
    expect(await screen.findByRole('button', { name: /Am ridicat comanda/ })).toBeTruthy();
    expect(screen.getByText('Cod de ridicare')).toBeTruthy();
  });

  it('оператору — «Нет доступа» вместо чужой страницы', async () => {
    installFakeApi({
      'GET /auth/me': () => ({ body: { user: user({ role: 'operator' }) } }),
      'GET /pickup/orders': () => ({ body: { items: [] } }),
    });
    renderAt('/pickup');
    expect(await screen.findByText('Нет доступа')).toBeTruthy();
    expect(screen.queryByTestId('pickup-code')).toBeNull();
  });

  it('нет нарушений доступности (axe)', async () => {
    installFakeApi({
      ...me,
      'GET /pickup/orders': () => ({ body: { items: [pickupView({ accessCode: '4821' })] } }),
    });
    const { container } = renderAt('/pickup');
    await screen.findByTestId('pickup-code');
    await screen.findByRole('img', { name: /QR-код/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});
