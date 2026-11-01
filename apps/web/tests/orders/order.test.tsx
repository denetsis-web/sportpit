import { act, configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { INSTALL_SHOWN_KEY } from '../../src/app/install.tsx';
import {
  apiError,
  availability,
  cleanUp,
  DISH_A,
  DISH_C,
  FRIDGE,
  installFakeApi,
  LOT,
  orderApi,
  orderDto,
  renderAt,
} from './fixtures.tsx';

// при полном прогоне на нагруженной машине 1 секунды ожидания экрана мало
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanUp();
  vi.unstubAllGlobals();
});

const confirmButton = () => screen.findByRole('button', { name: 'Подтвердить заказ' });

/** Кнопка «Подтвердить»: ждём, пока загрузятся меню и свободные места и она станет доступной. */
async function enabledConfirm(name = 'Подтвердить заказ') {
  const button = (await screen.findByRole('button', { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}

/** Блюдо можно добавлять, когда загружены меню и свободные места. */
async function addableButton(name: string) {
  const button = (await addButton(name)) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}
const addButton = (name: string) =>
  screen.findByRole('button', { name: `Добавить в заказ: ${name}` });

/** Холодильник из QR запомнен в localStorage, как делает меню. */
function rememberFridge(id = FRIDGE.id) {
  window.localStorage.setItem('sportpit.fridge', id);
}

function fireInstallEvent() {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('экран заказа: выбор и итоги (R10, R23)', () => {
  it('открывается по ссылке из меню: холодильник из QR, дата, блюдо уже в заказе, остаток кредитов и срок', async () => {
    rememberFridge();
    installFakeApi(orderApi());
    renderAt('/order?date=2026-03-11&dish=1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Заказ на завтра' })).toBeTruthy();
    const fridge = (await screen.findByLabelText('Холодильник')) as HTMLSelectElement;
    expect(fridge.value).toBe(FRIDGE.id);
    expect(((await screen.findByLabelText('Дата выдачи')) as HTMLSelectElement).value).toBe(
      '2026-03-11',
    );
    expect(await screen.findByText('Кредитов на счёте: 12')).toBeTruthy();
    expect(screen.getByText('После заказа останется: 11')).toBeTruthy();
    expect(screen.getByText('Заказы на этот день принимаются до 18:00, 10.03.2026.')).toBeTruthy();
    expect(screen.getByText('Свободно боксов: 12')).toBeTruthy();
    const dish = screen.getByRole('article', { name: /Курица с рисом/ });
    expect(within(dish).getByText('В заказе: 1')).toBeTruthy();
    expect(screen.getByText('Боксов в заказе: 1')).toBeTruthy();
  });

  it('итоги КБЖУ заказа считаются по блюдам и сравниваются с нормой дня', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    installFakeApi(orderApi());
    renderAt('/order?date=2026-03-11&dish=1');
    await screen.findByText('Боксов в заказе: 1');
    await ui.click(await addableButton('Овсянка с ягодами'));

    const totals = (await screen.findByRole('heading', { name: 'Итоги КБЖУ заказа' })).closest(
      'section',
    )!;
    const text = totals.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('870 ккал из 2345 ккал'); // 520 + 350
    expect(text).toContain('54,5 г из 160 г'); // белок 42,5 + 12
    expect(text).toContain('22 г из 65 г'); // жиры 14 + 8
    expect(text).toContain('110 г из 260 г'); // углеводы 55 + 55
    expect(text).toContain('13 г из 33 г'); // клетчатка 6 + 7
  });

  it('без анкеты норма не показана, есть приглашение заполнить её; итоги заказа видны', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({
        'GET /profile': () => ({ body: { profile: null, targets: null, healthConsent: false } }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    await screen.findByText('Боксов в заказе: 1');
    const totals = (await screen.findByRole('heading', { name: 'Итоги КБЖУ заказа' })).closest(
      'section',
    )!;
    expect(totals.textContent).toContain('520 ккал');
    expect(totals.textContent).not.toContain('из 2345');
    expect(within(totals).getByRole('link', { name: 'Заполнить анкету' })).toBeTruthy();
  });

  it('блюдо без порций отключено («Закончилось»); число блюд не больше остатка порций', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    installFakeApi(orderApi());
    renderAt('/order?date=2026-03-11');
    const soldOut = await screen.findByRole('article', { name: /Лосось с овощами/ });
    expect(within(soldOut).getByText('Закончилось')).toBeTruthy();
    expect(
      (within(soldOut).getByRole('button', { name: /Добавить/ }) as HTMLButtonElement).disabled,
    ).toBe(true);

    // у блюда A осталось 5 порций, но лимит клиента в день — 3
    const add = await addableButton(DISH_A.name.ru);
    for (let i = 0; i < 6; i += 1) {
      if (!(add as HTMLButtonElement).disabled) await ui.click(add);
    }
    expect(screen.getByText('Боксов в заказе: 3')).toBeTruthy();
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('число блюд не превышает остаток кредитов: при одном кредите второй бокс не добавить', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    installFakeApi(
      orderApi({
        'GET /credits': () => ({ body: { balance: 1, lots: [{ ...LOT, remaining: 1 }] } }),
      }),
    );
    renderAt('/order?date=2026-03-11');
    await ui.click(await addableButton(DISH_A.name.ru));
    expect(((await addButton(DISH_C.name.ru)) as HTMLButtonElement).disabled).toBe(true);
    expect(((await addButton(DISH_A.name.ru)) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('После заказа останется: 0')).toBeTruthy();
  });

  it('нет кредитов: подсказка и ссылка «Купить пакет», подтвердить нельзя', async () => {
    rememberFridge();
    installFakeApi(orderApi({ 'GET /credits': () => ({ body: { balance: 0, lots: [] } }) }));
    renderAt('/order?date=2026-03-11&dish=1');
    expect(await screen.findByRole('link', { name: 'Купить пакет' })).toBeTruthy();
    expect(((await confirmButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it('в интерфейсе заказа нет выбора доставки домой', async () => {
    rememberFridge();
    installFakeApi(orderApi());
    const { container } = renderAt('/order?date=2026-03-11&dish=1');
    await confirmButton();
    expect(container.textContent).not.toMatch(/достав/i);
    expect(container.textContent).not.toMatch(/курьер/i);
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });
});

describe('срок, вместимость, лимиты (R39, R46, R59)', () => {
  it('после срока подтвердить нельзя: кнопка отключена и сказано почему', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({
        'GET /orders/availability': () => ({ body: availability({ closedReason: 'cutoff' }) }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    expect(
      await screen.findByText('Приём заказов на этот день закрыт: он шёл до 18:00 накануне.'),
    ).toBeTruthy();
    expect(((await confirmButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it('на сегодняшнюю дату заказ невозможен: кнопка отключена, понятный текст', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({
        'GET /orders/availability': () => ({ body: availability({ closedReason: 'date' }) }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    expect(
      await screen.findByText(
        'Заказать можно только накануне: выберите завтрашний или более поздний день.',
      ),
    ).toBeTruthy();
    expect(((await confirmButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it('мест нет: «Мест нет», подтвердить нельзя', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({ 'GET /orders/availability': () => ({ body: availability({ boxesLeft: 0 }) }) }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    expect(await screen.findByText('Мест нет')).toBeTruthy();
    expect(((await confirmButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it('больше свободных мест не добавить, а сохранённая корзина больше мест не подтверждается', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({ 'GET /orders/availability': () => ({ body: availability({ boxesLeft: 1 }) }) }),
    );
    const first = renderAt('/order?date=2026-03-11&dish=1');
    await screen.findByText('Боксов в заказе: 1');
    await screen.findByText('Свободно боксов: 1');
    // единственное место занято блюдом из ссылки: ещё одно добавить нельзя
    expect(((await addButton(DISH_C.name.ru)) as HTMLButtonElement).disabled).toBe(true);
    first.unmount();

    // место разобрали, пока корзина лежала на устройстве: два бокса на одно место не подтвердить
    window.localStorage.setItem(
      'sportpit.cart',
      JSON.stringify({
        fridgeId: FRIDGE.id,
        date: '2026-03-11',
        items: [
          { dishId: 1, qty: 1 },
          { dishId: 3, qty: 1 },
        ],
        key: null,
      }),
    );
    renderAt('/order?date=2026-03-11');
    expect(await screen.findByText('Боксов в заказе: 2')).toBeTruthy();
    expect(await screen.findByText('Свободно боксов: 1')).toBeTruthy();
    expect(((await confirmButton()) as HTMLButtonElement).disabled).toBe(true);
  });

  it('лимит боксов в день: уже заказанные учитываются', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({ 'GET /orders/availability': () => ({ body: availability({ userBoxes: 2 }) }) }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    await screen.findByText('Боксов в заказе: 1');
    await screen.findByText('Свободно боксов: 12');
    expect(((await addButton(DISH_C.name.ru)) as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('В день можно заказать не больше 3 боксов. У вас уже заказано: 2.'),
    ).toBeTruthy();
  });

  it('пауза пакета на этот день: кнопка отключена, сказано почему', async () => {
    rememberFridge();
    installFakeApi(
      orderApi({
        'GET /orders/availability': () => ({ body: availability({ closedReason: 'paused' }) }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    expect(
      await screen.findByText('На этот день стоит пауза пакета, заказать нельзя.'),
    ).toBeTruthy();
    expect(((await confirmButton()) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('подтверждение (R10.1, R10.2, R31)', () => {
  it('отправляет холодильник, дату, блюда и ключ; показывает код получения и очищает корзину', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    const api = installFakeApi(
      orderApi({
        'POST /orders': () => ({
          status: 201,
          body: { order: orderDto({ boxes: 1 }), firstOrder: true },
        }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    await ui.click(await enabledConfirm());

    expect(await screen.findByRole('heading', { name: 'Заказ подтверждён' })).toBeTruthy();
    expect(screen.getByText('4821')).toBeTruthy();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Мои заказы' })).toBeTruthy();
    const [call] = api.callsTo('POST /orders');
    expect(call!.body).toMatchObject({
      fridgeId: FRIDGE.id,
      date: '2026-03-11',
      items: [{ dishId: 1, qty: 1 }],
    });
    expect((call!.body as { idempotencyKey: string }).idempotencyKey.length).toBeGreaterThanOrEqual(
      8,
    );
    // корзина очищена: после обновления страницы блюд в заказе нет
    expect(window.localStorage.getItem('sportpit.cart')).toBeNull();
  });

  it('двойное нажатие даёт один запрос', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    const api = installFakeApi(
      orderApi({
        'POST /orders': async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { status: 201, body: { order: orderDto(), firstOrder: false } };
        },
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    const button = await enabledConfirm();
    await ui.dblClick(button);
    await screen.findByRole('heading', { name: 'Заказ подтверждён' });
    expect(api.callsTo('POST /orders')).toHaveLength(1);
  });

  it('нет связи: «Нет связи, заказ не отправлен», блюда остались, повтор идёт с тем же ключом и проходит', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    let online = false;
    const calls: unknown[] = [];
    const routes = orderApi({
      'POST /orders': (request) => {
        calls.push(request.body);
        return { status: 201, body: { order: orderDto(), firstOrder: false } };
      },
    });
    const real = installFakeApi(routes);
    const fetchMock = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!online && String(input).endsWith('/orders') && init?.method === 'POST') {
        throw new TypeError('Failed to fetch');
      }
      return fetchMock(input, init);
    });
    renderAt('/order?date=2026-03-11&dish=1');
    await ui.click(await enabledConfirm());

    expect(
      await screen.findByText(
        'Нет связи, заказ не отправлен. Выбранные блюда сохранены, повторите позже.',
      ),
    ).toBeTruthy();
    // выбранное осталось и на экране, и в локальном хранилище
    expect(screen.getByText('Боксов в заказе: 1')).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem('sportpit.cart') ?? 'null');
    expect(saved.items).toEqual([{ dishId: 1, qty: 1 }]);
    expect(real.callsTo('POST /orders')).toHaveLength(0);

    online = true;
    await ui.click(await enabledConfirm());
    expect(await screen.findByRole('heading', { name: 'Заказ подтверждён' })).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('повтор после обрыва использует тот же ключ идемпотентности (обновление страницы не создаёт второй заказ)', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    const keys: string[] = [];
    let attempt = 0;
    installFakeApi(
      orderApi({
        'POST /orders': (request) => {
          keys.push((request.body as { idempotencyKey: string }).idempotencyKey);
          attempt += 1;
          if (attempt === 1) return apiError(503, 'unavailable', 'core.error.generic');
          return { status: 200, body: { order: orderDto(), firstOrder: false } };
        },
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    await ui.click(await enabledConfirm());
    await screen.findByRole('alert');
    await ui.click(await enabledConfirm());
    await screen.findByRole('heading', { name: 'Заказ подтверждён' });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('после первого успешного заказа один раз предлагается установить приложение', async () => {
    rememberFridge();
    fireInstallEvent();
    const ui = userEvent.setup();
    installFakeApi(
      orderApi({
        'POST /orders': () => ({ status: 201, body: { order: orderDto(), firstOrder: true } }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    expect(screen.queryByText('Установите приложение')).toBeNull();
    await ui.click(await enabledConfirm());
    expect(await screen.findByText('Установите приложение')).toBeTruthy();
    expect(window.localStorage.getItem(INSTALL_SHOWN_KEY)).not.toBeNull();
  });

  it('не первый заказ: подсказка об установке не появляется', async () => {
    rememberFridge();
    fireInstallEvent();
    const ui = userEvent.setup();
    installFakeApi(
      orderApi({
        'POST /orders': () => ({ status: 201, body: { order: orderDto(), firstOrder: false } }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    await ui.click(await enabledConfirm());
    await screen.findByRole('heading', { name: 'Заказ подтверждён' });
    expect(screen.queryByText('Установите приложение')).toBeNull();
  });

  it('отказ сервера: нехватка порции называет блюдо, блюда в заказе остаются', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    installFakeApi(
      orderApi({
        'POST /orders': () =>
          apiError(409, 'dish_sold_out', 'orders.error.dishSoldOut', {
            dish: 'Курица с рисом',
            dishId: 1,
          }),
      }),
    );
    renderAt('/order?date=2026-03-11&dish=1');
    await ui.click(await enabledConfirm());
    expect(
      await screen.findByText('Не хватило порций блюда «Курица с рисом». Заказ не создан.'),
    ).toBeTruthy();
    expect(screen.getByText('Боксов в заказе: 1')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Заказ подтверждён' })).toBeNull();
  });

  it('корзина хранится локально: после перезагрузки страницы выбранные блюда на месте', async () => {
    rememberFridge();
    const ui = userEvent.setup();
    installFakeApi(orderApi());
    const first = renderAt('/order?date=2026-03-11&dish=1');
    await ui.click(await addableButton(DISH_C.name.ru));
    await screen.findByText('Боксов в заказе: 2');
    first.unmount();

    renderAt('/order?date=2026-03-11');
    expect(await screen.findByText('Боксов в заказе: 2')).toBeTruthy();
  });
});

describe('перенос заказа', () => {
  it('открывает прежний заказ в корзине и отправляет перенос одним запросом', async () => {
    const ui = userEvent.setup();
    const api = installFakeApi(
      orderApi({
        'GET /orders/ord-1': () => ({ body: { order: orderDto() } }),
        'POST /orders/ord-1/move': () => ({
          status: 201,
          body: { order: orderDto({ id: 'ord-2', code: '1357' }), cancelledId: 'ord-1' },
        }),
      }),
    );
    renderAt('/order?move=ord-1');
    expect(await screen.findByRole('heading', { name: 'Перенос заказа' })).toBeTruthy();
    // в корзине блюда прежнего заказа, а кредиты считаются с учётом возвращаемых
    expect(await screen.findByText('Боксов в заказе: 2')).toBeTruthy();
    await ui.click(await addableButton(DISH_C.name.ru));
    await ui.click(await enabledConfirm('Перенести заказ'));

    expect(await screen.findByRole('heading', { name: 'Заказ перенесён' })).toBeTruthy();
    expect(screen.getByText('1357')).toBeTruthy();
    expect(api.callsTo('POST /orders')).toHaveLength(0);
    const [call] = api.callsTo('POST /orders/ord-1/move');
    expect(call!.body).toMatchObject({
      fridgeId: FRIDGE.id,
      date: '2026-03-11',
      items: [
        { dishId: 1, qty: 2 },
        { dishId: 3, qty: 1 },
      ],
    });
  });

  it('заказ, который нельзя перенести, не открывается', async () => {
    installFakeApi(
      orderApi({
        'GET /orders/ord-1': () => ({ body: { order: orderDto({ canChange: false }) } }),
      }),
    );
    renderAt('/order?move=ord-1');
    expect(
      await screen.findByText('Заказ для переноса не найден или его уже нельзя изменить.'),
    ).toBeTruthy();
  });
});

describe('вход, язык, доступность', () => {
  it('без входа ведёт на экран входа', async () => {
    installFakeApi({ ...orderApi(), 'GET /auth/me': () => ({ body: { user: null } }) });
    renderAt('/order?date=2026-03-11&dish=1');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy();
  });

  it('по-румынски: тексты и срок', async () => {
    rememberFridge();
    installFakeApi(orderApi());
    renderAt('/order?date=2026-03-11&dish=1', 'ro');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Comandă pentru mâine' }),
    ).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Confirmă comanda' })).toBeTruthy();
    expect(
      screen.getByText('Comenzile pentru această zi se primesc până la 18:00, 10.03.2026.'),
    ).toBeTruthy();
  });

  it('axe: без критических нарушений', async () => {
    rememberFridge();
    installFakeApi(orderApi());
    const { container } = renderAt('/order?date=2026-03-11&dish=1');
    await confirmButton();
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
