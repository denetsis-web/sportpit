import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { asAdmin, asClient, cleanUp, installFake, renderAt } from './fixtures.tsx';

afterEach(cleanUp);

const DISH = { dishId: 1, name: { ru: 'Курица с рисом', ro: 'Pui cu orez' }, qty: 1 };
const order = (overrides: Record<string, unknown> = {}) => ({
  orderId: 'ord-1',
  date: '2026-03-11',
  status: 'picked_up',
  canRate: true,
  fridgeName: 'Холодильник у входа',
  gymName: 'Зал «Тест»',
  dishes: [{ ...DISH, rating: null }],
  canComplain: true,
  ...overrides,
});

const rating = (stars: number, tag: string | null = null, canEdit = true) => ({
  orderId: 'ord-1',
  dishId: 1,
  stars,
  tag,
  createdAt: '2026-03-11T09:00:00.000Z',
  updatedAt: '2026-03-11T09:00:00.000Z',
  editableUntil: '2026-03-12T09:00:00.000Z',
  canEdit,
});

describe('оценка блюд (R26)', () => {
  it('ссылка из уведомления /rate/:orderId: звёзды и тег уходят на сервер, есть кнопка «Проблема с боксом»', async () => {
    const saved = vi.fn(() => ({ body: { rating: rating(4, 'taste') } }));
    const api = installFake({
      ...asClient,
      'GET /feedback/orders': () => ({ body: { items: [order(), order({ orderId: 'ord-2' })] } }),
      'PUT /feedback/ratings': saved,
    });
    const user = userEvent.setup();
    const { container } = renderAt('/rate/ord-1');
    expect(await screen.findByRole('heading', { name: 'Заказ на 11.03.2026' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    await user.click(screen.getByRole('radio', { name: '4 из 5' }));
    await user.click(screen.getByRole('radio', { name: 'Вкус' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(api.callsTo('PUT /feedback/ratings')[0]!.body).toEqual({
      orderId: 'ord-1',
      dishId: 1,
      stars: 4,
      tag: 'taste',
    });
    expect(await screen.findByText('Оценка сохранена.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Проблема с боксом' }).getAttribute('href')).toBe(
      '/support/new?order=ord-1',
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('без звёзд оценка не отправляется; после 24 часов оценка только читается', async () => {
    const saved = vi.fn(() => ({ body: { rating: rating(5) } }));
    installFake({
      ...asClient,
      'GET /feedback/orders': () => ({
        body: {
          items: [
            order({ dishes: [{ ...DISH, rating: null }] }),
            order({ orderId: 'ord-3', dishes: [{ ...DISH, rating: rating(5, null, false) }] }),
          ],
        },
      }),
      'PUT /feedback/ratings': saved,
    });
    const user = userEvent.setup();
    renderAt('/rate');
    const buttons = await screen.findAllByRole('button', { name: 'Сохранить оценку' });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    expect(await screen.findByText('Выберите число звёзд.')).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByText('Срок изменения оценки (24 часа) истёк.')).toBeTruthy();
  });

  it('пока нечего оценивать: приглашение «Выбрать блюда»', async () => {
    installFake({ ...asClient, 'GET /feedback/orders': () => ({ body: { items: [] } }) });
    renderAt('/rate');
    expect(await screen.findByText('Оценивать пока нечего')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Выбрать блюда' }).getAttribute('href')).toBe('/menu');
  });
});

const complaintDto = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  orderId: 'ord-1',
  orderDate: '2026-03-11',
  dishId: 1,
  dishName: DISH.name,
  reason: 'spoiled',
  description: 'Запах',
  status: 'open',
  outcome: null,
  comment: null,
  createdAt: '2026-03-12T09:00:00.000Z',
  resolvedAt: null,
  photos: [{ id: 5, url: '/api/v1/feedback/complaints/c1/photos/5', contentType: 'image/jpeg' }],
  history: [{ kind: 'created', at: '2026-03-12T09:00:00.000Z', comment: null }],
  ...overrides,
});

describe('поддержка и жалоба (R30, R30.1)', () => {
  it('контакты из настроек и статусы обращений с исходом и комментарием', async () => {
    installFake({
      ...asClient,
      'GET /feedback/support': () => ({
        body: {
          contacts: { phone: '+37300000000', email: '[ВПИШИ]', messenger: '[ВПИШИ]' },
          complaints: [
            complaintDto({
              id: 'c2',
              status: 'resolved',
              outcome: 'replacement',
              history: [
                { kind: 'created', at: '2026-03-12T09:00:00.000Z', comment: null },
                { kind: 'replacement', at: '2026-03-12T10:00:00.000Z', comment: null },
              ],
            }),
            complaintDto({ status: 'rejected', outcome: 'reject', comment: 'Нет оснований' }),
          ],
        },
      }),
    });
    const { container } = renderAt('/support');
    expect(await screen.findByText('+37300000000')).toBeTruthy();
    expect(screen.getAllByText('[ВПИШИ]')).toHaveLength(2);
    expect(screen.getByText('Решено')).toBeTruthy();
    expect(screen.getByText(/выберите блюдо на любой день/)).toBeTruthy();
    expect(screen.getByText('Комментарий: Нет оснований')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Фото к жалобе' })[0]!.getAttribute('src')).toBe(
      '/api/v1/feedback/complaints/c1/photos/5',
    );
    expect(screen.getByRole('link', { name: 'Проблема с боксом' }).getAttribute('href')).toBe(
      '/support/new',
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('форма: без причины не отправляется, не-JPEG/PNG и файл больше 5 МБ отклоняются, верная жалоба уходит с фото', async () => {
    const sent = vi.fn(() => ({ status: 201, body: { complaint: complaintDto() } }));
    const api = installFake({
      ...asClient,
      'GET /feedback/orders': () => ({ body: { items: [order()] } }),
      'POST /feedback/complaints': sent,
    });
    const user = userEvent.setup({ applyAccept: false });
    renderAt('/support/new?order=ord-1');
    const select = await screen.findByLabelText('Заказ');
    expect((select as HTMLSelectElement).value).toBe('ord-1');

    await user.click(screen.getByRole('button', { name: 'Отправить жалобу' }));
    expect(await screen.findByText('Выберите причину.')).toBeTruthy();
    expect(sent).not.toHaveBeenCalled();

    const file = screen.getByLabelText('Фото');
    await user.upload(file, new File(['GIF89a'], 'a.gif', { type: 'image/gif' }));
    expect(await screen.findByText('Подойдут только фото JPEG или PNG.')).toBeTruthy();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    await user.upload(file, big);
    expect(await screen.findByText('Фото больше 5 МБ. Выберите файл поменьше.')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Причина'), 'spoiled');
    await user.type(screen.getByLabelText('Что случилось'), 'Запах');
    await user.upload(
      file,
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'ok.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Отправить жалобу' }));
    await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    const form = api.callsTo('POST /feedback/complaints')[0]!.form!;
    expect(form.get('orderId')).toBe('ord-1');
    expect(form.get('reason')).toBe('spoiled');
    expect(form.get('description')).toBe('Запах');
    expect((form.get('photo') as File).name).toBe('ok.jpg');
    expect(await screen.findByText(/Жалоба отправлена/)).toBeTruthy();
  });

  it('нет заказов, на которые можно пожаловаться: понятное сообщение', async () => {
    installFake({
      ...asClient,
      'GET /feedback/orders': () => ({ body: { items: [order({ canComplain: false })] } }),
    });
    renderAt('/support/new');
    expect(
      await screen.findByText('Пока нет заказов, на которые можно пожаловаться.'),
    ).toBeTruthy();
  });
});

const adminComplaint = (overrides: Record<string, unknown> = {}) => ({
  ...complaintDto(),
  userId: 12,
  gymName: 'Зал «Тест»',
  fridgeName: 'Холодильник у входа',
  items: [{ dishId: 1, name: DISH.name, qty: 1 }],
  ...overrides,
});

describe('админка: очередь жалоб (R38, R44.1)', () => {
  it('«замена» подтверждается в окне и уходит на сервер без комментария; видны фото, блюда и клиент', async () => {
    const resolved = vi.fn(() => ({ body: { complaint: adminComplaint({ status: 'resolved' }) } }));
    let open = [adminComplaint()];
    const api = installFake({
      ...asAdmin,
      'GET /admin/complaints': () => ({ body: { items: open, openCount: open.length } }),
      'POST /admin/complaints/c1/resolve': () => {
        open = [];
        return resolved();
      },
    });
    const user = userEvent.setup();
    const { container } = renderAt('/admin/complaints');
    const card = await screen.findByRole('article', { name: /Жалоба: Несвежий/ });
    expect(within(card).getByText(/Клиент № 12/)).toBeTruthy();
    expect(within(card).getByText(/Курица с рисом × 1/)).toBeTruthy();
    expect(within(card).getByRole('img', { name: 'Фото к жалобе' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(within(card).getByRole('button', { name: 'Замена другим блюдом' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/выберите блюдо на любой день/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Принять решение' }));
    await waitFor(() => expect(resolved).toHaveBeenCalledTimes(1));
    expect(api.callsTo('POST /admin/complaints/c1/resolve')[0]!.body).toEqual({
      outcome: 'replacement',
    });
    expect(await screen.findByText('Жалоб нет.')).toBeTruthy();
    expect(screen.getByText('Решение сохранено, клиент получил уведомление.')).toBeTruthy();
  });

  it('«отказ» отправляет комментарий; ошибка сервера показывается в окне', async () => {
    const api = installFake({
      ...asAdmin,
      'GET /admin/complaints': () => ({ body: { items: [adminComplaint()], openCount: 1 } }),
      'POST /admin/complaints/c1/resolve': () => ({
        status: 400,
        body: {
          error: {
            code: 'validation_failed',
            messageKey: 'feedback.error.commentRequired',
            message: 'x',
            fields: { comment: 'feedback.error.commentRequired' },
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderAt('/admin/complaints');
    const card = await screen.findByRole('article', { name: /Жалоба: Несвежий/ });
    await user.click(within(card).getByRole('button', { name: 'Отказ' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Комментарий'), 'Нет оснований');
    await user.click(within(dialog).getByRole('button', { name: 'Принять решение' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(api.callsTo('POST /admin/complaints/c1/resolve')[0]!.body).toEqual({
      outcome: 'reject',
      comment: 'Нет оснований',
    });
  });
});
