import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError, installFakeApi } from '../auth/fakeApi.ts';
import { cleanUp } from '../auth/render.tsx';
import { card, item, menu, renderAt, TODAY, TOMORROW } from './fixtures.tsx';

// при полном прогоне на нагруженной машине 1 секунды ожидания экрана мало

afterEach(cleanUp);

const guest = { 'GET /auth/me': () => ({ body: { user: null } }) };

describe('меню: карточки (R18, R03)', () => {
  it('карточка показывает фото, название, ккал, БЖУ, клетчатку, аллергены, рейтинг «нет оценок» и «приготовим накануне вечером»', async () => {
    installFakeApi({ ...guest, 'GET /menu': () => ({ body: menu() }) });
    renderAt('/menu');
    const dish = await screen.findByRole('article', { name: /Курица с рисом/ });
    expect(within(dish).getByRole('img', { name: 'Курица с рисом' }).getAttribute('src')).toBe(
      '/api/v1/files/dishes/1-abc.jpg',
    );
    expect(within(dish).getByText('520 ккал')).toBeTruthy();
    expect(within(dish).getByText('42,5 г')).toBeTruthy();
    expect(within(dish).getByText('Белок')).toBeTruthy();
    expect(within(dish).getByText('Жиры')).toBeTruthy();
    expect(within(dish).getByText('Углеводы')).toBeTruthy();
    expect(within(dish).getByText('Клетчатка')).toBeTruthy();
    expect(
      within(dish)
        .getByText(/Аллергены/)
        .closest('p')?.textContent,
    ).toContain('глютен');
    expect(within(dish).getByText('нет оценок')).toBeTruthy();
    // меню на завтра — будущая дата: вместо времени приготовления срок
    expect(within(dish).getByText('Приготовим накануне вечером')).toBeTruthy();
    expect(within(dish).queryByText(/Приготовлено/)).toBeNull();
  });

  it('слоган и допуск КБЖУ из настроек видны на экране меню', async () => {
    installFakeApi({ ...guest, 'GET /menu': () => ({ body: menu() }) });
    renderAt('/menu');
    await screen.findByRole('article');
    expect(screen.getByText('Вкусно. Свежо. Чётко по КБЖУ')).toBeTruthy();
    expect(screen.getByText('Допуск КБЖУ: ±5% по белку')).toBeTruthy();
  });

  it('меню на сегодня: если кухня отметила партию, видно «Приготовлено … в …» и «съесть до»', async () => {
    installFakeApi({
      ...guest,
      'GET /menu': () => ({
        body: menu({
          date: TODAY,
          items: [item({ cookedAt: '2026-03-09T20:00:00.000Z', shelfLifeHours: 24 })],
        }),
      }),
    });
    renderAt('/menu');
    const dish = await screen.findByRole('article');
    // 20:00 UTC — это 22:00 в Кишинёве (зимнее время)
    expect(within(dish).getByText(/Приготовлено 09\.03\.2026 в 22:00/)).toBeTruthy();
    expect(within(dish).getByText(/съесть до 10\.03\.2026 22:00/)).toBeTruthy();
    expect(within(dish).queryByText(/накануне вечером/)).toBeNull();
  });

  it('рейтинг со средней оценкой и числом голосов', async () => {
    installFakeApi({
      ...guest,
      'GET /menu': () => ({ body: menu({ items: [item({ rating: { avg: 4.5, count: 12 } })] }) }),
    });
    renderAt('/menu');
    const dish = await screen.findByRole('article');
    expect(within(dish).getByText(/4,5 из 5 · оценок: 12/)).toBeTruthy();
    expect(within(dish).queryByText('нет оценок')).toBeNull();
  });

  it('по-румынски: те же поля, допуск берётся на румынском', async () => {
    installFakeApi({ ...guest, 'GET /menu': () => ({ body: menu() }) });
    renderAt('/menu', 'ro');
    const dish = await screen.findByRole('article', { name: /Pui cu orez/ });
    expect(within(dish).getByText('Proteine')).toBeTruthy();
    expect(within(dish).getByText('fără evaluări')).toBeTruthy();
    expect(within(dish).getByText('Vom găti în seara dinainte')).toBeTruthy();
    expect(screen.getByText('Toleranță valori nutriționale: ±5% la proteine')).toBeTruthy();
  });

  it('нет автоматических нарушений доступности', async () => {
    installFakeApi({ ...guest, 'GET /menu': () => ({ body: menu() }) });
    const { container } = renderAt('/menu');
    await screen.findByRole('article');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('меню: пустые состояния и «Закончилось» (R18.2, R18.3)', () => {
  it('день не опубликован: «Меню появится позже» и ближайшая дата; кнопка открывает этот день', async () => {
    const ui = userEvent.setup();
    const api = installFakeApi({
      ...guest,
      'GET /menu': (req) =>
        req.query.get('date') === '2026-03-14'
          ? { body: menu({ date: '2026-03-14' }) }
          : { body: menu({ published: false, items: [], nextDate: '2026-03-14' }) },
    });
    renderAt('/menu');
    expect(await screen.findByText('Меню появится позже')).toBeTruthy();
    expect(screen.getByText('Ближайший день с меню: 14.03.2026.')).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
    await ui.click(screen.getByRole('button', { name: 'Показать меню на 14.03.2026' }));
    await screen.findByRole('article');
    expect(api.callsTo('GET /menu').at(-1)!.query.get('date')).toBe('2026-03-14');
  });

  it('нет ближайшей даты — понятный текст вместо пустой страницы', async () => {
    installFakeApi({
      ...guest,
      'GET /menu': () => ({ body: menu({ published: false, items: [] }) }),
    });
    renderAt('/menu');
    expect(await screen.findByText('Меню появится позже')).toBeTruthy();
    expect(screen.getByText('Ближайшая дата пока не известна.')).toBeTruthy();
  });

  it('блюдо без остатка помечено «Закончилось», кнопка «В заказ» отключена; с остатком — ссылка в заказ', async () => {
    installFakeApi({
      ...guest,
      'GET /menu': () => ({
        body: menu({
          items: [
            item({ id: 1, name: { ru: 'Есть', ro: 'Există' }, portionsLeft: 3 }),
            item({ id: 2, name: { ru: 'Нет', ro: 'Nu' }, portionsLeft: 0, soldOut: true }),
          ],
        }),
      }),
    });
    renderAt('/menu');
    const available = await screen.findByRole('article', { name: 'Есть' });
    const soldOut = screen.getByRole('article', { name: 'Нет' });
    expect(within(soldOut).getByText('Закончилось')).toBeTruthy();
    const disabled = within(soldOut).getByRole('button', { name: 'В заказ' }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(within(soldOut).queryByRole('link', { name: 'В заказ' })).toBeNull();
    const link = within(available).getByRole('link', { name: 'В заказ' });
    expect(link.getAttribute('href')).toBe(`/order?date=${TOMORROW}&dish=1`);
    expect(within(available).getByText('Осталось порций: 3')).toBeTruthy();
  });

  it('нет связи: понятное сообщение и кнопка «Повторить»', async () => {
    const ui = userEvent.setup();
    let online = false;
    const api = installFakeApi({
      ...guest,
      'GET /menu': () => {
        if (!online) throw new TypeError('Failed to fetch');
        return { body: menu() };
      },
    });
    renderAt('/menu');
    expect((await screen.findByRole('alert')).textContent).toContain('Нет связи с сервером');
    online = true;
    await ui.click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findByRole('article');
    expect(api.callsTo('GET /menu').length).toBeGreaterThanOrEqual(2);
  });

  it('ошибка сервера показывается текстом, а не пустым экраном', async () => {
    installFakeApi({
      ...guest,
      'GET /menu': () => apiError(400, 'validation_failed', 'catalog.error.date'),
    });
    renderAt('/menu');
    expect((await screen.findByRole('alert')).textContent).toContain('ГГГГ-ММ-ДД');
  });
});

describe('меню: фильтры (R18.1)', () => {
  const dishes = [
    item({
      id: 1,
      name: { ru: 'Курица', ro: 'Pui' },
      proteinG: 45,
      goals: ['maintain', 'gain'],
      allergens: ['gluten'],
    }),
    item({
      id: 2,
      name: { ru: 'Салат', ro: 'Salată' },
      proteinG: 18,
      goals: ['lose'],
      vegetarian: true,
      allergens: [],
    }),
    item({
      id: 3,
      name: { ru: 'Сырники', ro: 'Papanași' },
      proteinG: 30,
      goals: ['maintain'],
      vegetarian: true,
      allergens: ['lactose', 'eggs'],
    }),
    item({
      id: 4,
      name: { ru: 'Лосось', ro: 'Somon' },
      proteinG: 38,
      goals: ['lose', 'gain'],
      allergens: ['fish'],
    }),
  ];
  const names = () =>
    screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent);

  async function open() {
    const ui = userEvent.setup();
    const api = installFakeApi({
      ...guest,
      'GET /menu': () => ({ body: menu({ items: dishes }) }),
    });
    renderAt('/menu');
    await screen.findAllByRole('article');
    return { ui, api };
  }

  it('каждый фильтр сразу меняет список и не делает нового запроса', async () => {
    const { ui, api } = await open();
    expect(names()).toEqual(['Курица', 'Салат', 'Сырники', 'Лосось']);

    await ui.selectOptions(screen.getByLabelText('Цель'), 'lose');
    expect(names()).toEqual(['Салат', 'Лосось']);
    await ui.selectOptions(screen.getByLabelText('Цель'), '');

    await ui.type(screen.getByLabelText('Белок от, г'), '38');
    expect(names()).toEqual(['Курица', 'Лосось']);
    await ui.clear(screen.getByLabelText('Белок от, г'));

    await ui.click(screen.getByLabelText('Без глютена'));
    expect(names()).toEqual(['Салат', 'Сырники', 'Лосось']);
    await ui.click(screen.getByLabelText('Без глютена'));

    await ui.click(screen.getByLabelText('Без лактозы'));
    expect(names()).toEqual(['Курица', 'Салат', 'Лосось']);
    await ui.click(screen.getByLabelText('Без лактозы'));

    await ui.click(screen.getByLabelText('Вегетарианское'));
    expect(names()).toEqual(['Салат', 'Сырники']);
    expect(api.callsTo('GET /menu')).toHaveLength(1);
  });

  it('фильтры сочетаются по «И»; число найденных блюд объявляется; сброс возвращает всё', async () => {
    const { ui } = await open();
    await ui.selectOptions(screen.getByLabelText('Цель'), 'lose');
    await ui.click(screen.getByLabelText('Вегетарианское'));
    expect(names()).toEqual(['Салат']);
    expect(screen.getByText('Найдено блюд: 1')).toBeTruthy();

    await ui.click(screen.getByLabelText('Без лактозы'));
    await ui.type(screen.getByLabelText('Белок от, г'), '30');
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText(/Под выбранные фильтры блюд нет/)).toBeTruthy();

    await ui.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(names()).toHaveLength(4);
  });
});

describe('карточка блюда (R19, R24)', () => {
  const reviews = [
    { stars: 5, tag: 'taste', createdAt: '2026-03-09T18:00:00.000Z' },
    { stars: 3, tag: null, createdAt: '2026-03-08T10:00:00.000Z' },
  ];

  it('состав, вес порции, КБЖУ, отзывы со звёздами, тегом и датой (без автора), кнопка «В заказ», допуск в подвале', async () => {
    const api = installFakeApi({
      ...guest,
      'GET /dishes/1': () => ({
        body: card({
          reviews,
          dish: { ...item({ rating: { avg: 4, count: 2 } }), onMenu: true },
        }),
      }),
    });
    renderAt(`/menu/dish/1?date=${TOMORROW}`);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Курица с рисом');
    expect(api.callsTo('GET /dishes/1')[0]!.query.get('date')).toBe(TOMORROW);
    expect(screen.getByText('куриная грудка, рис, брокколи')).toBeTruthy();
    expect(screen.getByText('Вес порции: 380 г')).toBeTruthy();
    expect(screen.getByText('520 ккал')).toBeTruthy();
    expect(screen.getByText(/4 из 5 · оценок: 2/)).toBeTruthy();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByLabelText('5 из 5')).toBeTruthy();
    expect(within(rows[0]!).getByText('Вкус')).toBeTruthy();
    expect(within(rows[0]!).getByText('09.03.2026')).toBeTruthy();
    expect(within(rows[1]!).getByLabelText('3 из 5')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'В заказ' }).getAttribute('href')).toBe(
      `/order?date=${TOMORROW}&dish=1`,
    );
    expect(screen.getByText('Допуск КБЖУ: ±5% по белку')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\+373/);
  });

  it('отзывов нет, оценок нет: «Отзывов пока нет» и «нет оценок»', async () => {
    installFakeApi({ ...guest, 'GET /dishes/1': () => ({ body: card() }) });
    renderAt(`/menu/dish/1?date=${TOMORROW}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Отзывов пока нет.')).toBeTruthy();
    expect(screen.getByText('нет оценок')).toBeTruthy();
  });

  it('блюдо закончилось — «В заказ» отключена', async () => {
    installFakeApi({
      ...guest,
      'GET /dishes/1': () => ({
        body: card({ dish: { ...item({ portionsLeft: 0, soldOut: true }), onMenu: true } }),
      }),
    });
    renderAt(`/menu/dish/1?date=${TOMORROW}`);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Закончилось')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'В заказ' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('неизвестное блюдо — сообщение и возврат к меню', async () => {
    installFakeApi({
      ...guest,
      'GET /dishes/9': () => apiError(404, 'not_found', 'catalog.error.dishNotFound'),
    });
    renderAt('/menu/dish/9');
    expect((await screen.findByRole('alert')).textContent).toBe('Блюдо не найдено.');
    expect(screen.getByRole('link', { name: 'К меню' }).getAttribute('href')).toBe('/menu');
  });

  it('нет автоматических нарушений доступности', async () => {
    installFakeApi({ ...guest, 'GET /dishes/1': () => ({ body: card({ reviews }) }) });
    const { container } = renderAt(`/menu/dish/1?date=${TOMORROW}`);
    await screen.findByRole('heading', { level: 1 });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('предвыбранный холодильник (R14.1)', () => {
  const fridge = {
    id: 'fr-main',
    gymId: 'g1',
    gymName: 'Зал «Атлант»',
    name: 'У входа',
    capacityBoxes: 30,
    cutoffTime: '18:00',
    pickupFrom: '07:00',
    pickupTo: '22:00',
  };

  it('меню, открытое с ?fridge=<id>, запоминает холодильник в localStorage и показывает его', async () => {
    installFakeApi({
      ...guest,
      'GET /menu': () => ({ body: menu() }),
      'GET /fridges/fr-main': () => ({ body: fridge }),
    });
    renderAt('/menu?fridge=fr-main');
    expect((await screen.findByTestId('selected-fridge')).textContent).toBe(
      'Ваш холодильник: Зал «Атлант», У входа',
    );
    expect(window.localStorage.getItem('sportpit.fridge')).toBe('fr-main');
  });

  it('значение не в формате идентификатора не запоминается', async () => {
    installFakeApi({ ...guest, 'GET /menu': () => ({ body: menu() }) });
    renderAt('/menu?fridge=%3Cscript%3E');
    await screen.findByRole('article');
    expect(window.localStorage.getItem('sportpit.fridge')).toBeNull();
    expect(screen.queryByTestId('selected-fridge')).toBeNull();
  });

  it('холодильник, которого сервер не знает, забывается', async () => {
    window.localStorage.setItem('sportpit.fridge', 'gone');
    installFakeApi({
      ...guest,
      'GET /menu': () => ({ body: menu() }),
      'GET /fridges/gone': () => apiError(404, 'not_found', 'admin.error.fridgeNotFound'),
    });
    renderAt('/menu');
    await screen.findByRole('article');
    await waitFor(() => expect(window.localStorage.getItem('sportpit.fridge')).toBeNull());
  });

  it('приложение при открытии по ссылке запоминает холодильник сразу, на любом адресе', async () => {
    window.history.pushState({}, '', '/?fridge=fr-gate');
    vi.resetModules();
    await import('../../src/features/client/menu/routes.tsx');
    expect(window.localStorage.getItem('sportpit.fridge')).toBe('fr-gate');
    window.history.pushState({}, '', '/');
  });
});
