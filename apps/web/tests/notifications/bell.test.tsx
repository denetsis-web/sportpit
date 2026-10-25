import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { NotificationsBell } from '../../src/features/client/notifications/Bell.tsx';
import { NotificationsPage } from '../../src/features/client/notifications/NotificationsPage.tsx';
import { resetNotifications } from '../../src/features/client/notifications/store.ts';
import { installFakeApi, user } from '../auth/fakeApi.ts';
import { cleanUp, renderAt, renderComponent } from '../auth/render.tsx';

afterEach(() => {
  vi.useRealTimers();
  resetNotifications();
  cleanUp();
});

type Item = {
  id: number;
  type: string;
  payload: Record<string, string | number | boolean | null>;
  createdAt: string;
  readAt: string | null;
};
const item = (
  id: number,
  type: string,
  payload: Item['payload'] = {},
  readAt: string | null = null,
): Item => ({
  id,
  type,
  payload,
  createdAt: '2026-03-10T09:30:00.000Z',
  readAt,
});

function installMark(items: Item[]) {
  // маршрут отметки по каждому номеру
  return Object.fromEntries(
    items.map((n) => [
      `POST /notifications/${n.id}/read`,
      () => {
        n.readAt ??= '2026-03-10T10:00:00.000Z';
        return {
          body: { marked: 1, unreadCount: items.filter((i) => i.readAt === null).length },
        };
      },
    ]),
  );
}

function withMarking(items: Item[], role: 'client' | 'admin' = 'client') {
  const unread = () => items.filter((i) => i.readAt === null).length;
  return installFakeApi({
    'GET /auth/me': () => ({ body: { user: user({ role }) } }),
    'GET /notifications': () => ({ body: { items, unreadCount: unread() } }),
    'POST /notifications/read-all': () => {
      const marked = unread();
      items.forEach((i) => (i.readAt ??= '2026-03-10T10:00:00.000Z'));
      return { body: { marked, unreadCount: 0 } };
    },
    ...installMark(items),
  });
}

const BELL_AND_PAGE = (
  <main>
    <NotificationsBell />
    <Routes>
      <Route path="/notifications" element={<NotificationsPage />} />
    </Routes>
  </main>
);

describe('колокольчик', () => {
  it('не показывается, пока не вошёл', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderComponent(<NotificationsBell />);
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
  });

  it('показывает число непрочитанных в названии и значке, ссылка ведёт к списку', async () => {
    withMarking([
      item(1, 'rate_dish'),
      item(2, 'credits_expiring'),
      item(3, 'rate_dish', {}, '2026-03-10T09:40:00.000Z'),
    ]);
    renderComponent(<NotificationsBell />);
    const link = await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 2' });
    expect(link.getAttribute('href')).toBe('/notifications');
    expect(within(link).getByText('2')).toBeTruthy();
  });

  it('без непрочитанных значка нет, название короткое; на румынском — свой текст', async () => {
    withMarking([item(1, 'rate_dish', {}, '2026-03-10T09:40:00.000Z')]);
    renderComponent(<NotificationsBell />, '/', 'ro');
    const link = await screen.findByRole('link', { name: 'Notificări' });
    expect(link.textContent).toBe('');
  });

  it('раз в минуту спрашивает сервер: новые уведомления появляются без перезагрузки', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const items = [item(1, 'rate_dish')];
    withMarking(items);
    renderComponent(<NotificationsBell />);
    await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 1' });
    items.push(item(2, 'complaint_resolved'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 2' });
  });
});

describe('список уведомлений', () => {
  it('тексты по типам на русском: заголовок, пояснение, данные', async () => {
    withMarking([
      item(4, 'system_alert', { kind: 'sms_failed', count: 3 }),
      item(3, 'complaint_resolved', { complaintId: 9 }),
      item(2, 'rate_dish', { orderId: 5 }),
      item(1, 'credits_expiring', { count: 4 }),
    ]);
    renderAt('/notifications');
    expect(await screen.findByRole('heading', { level: 1, name: 'Уведомления' })).toBeTruthy();
    expect(screen.getByText('Сбои в системе')).toBeTruthy();
    expect(screen.getByText('За последний час сбоев: 3. Источник: отправка SMS.')).toBeTruthy();
    expect(screen.getByText('Жалоба рассмотрена')).toBeTruthy();
    expect(screen.getByText('Как блюдо?')).toBeTruthy();
    expect(screen.getByText('Кредиты скоро сгорят')).toBeTruthy();
    expect(screen.getByText('Сгорает кредитов: 4')).toBeTruthy();
    expect(screen.getByText('Непрочитанных: 4')).toBeTruthy();
  });

  it('тексты на румынском', async () => {
    withMarking([
      item(1, 'rate_dish'),
      item(2, 'system_alert', { kind: 'payment_failed', count: 5 }),
    ]);
    renderAt('/notifications', 'ro');
    expect(await screen.findByText('Cum a fost preparatul?')).toBeTruthy();
    expect(screen.getByText('În ultima oră: 5 defecțiuni. Sursa: plata.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Citește-le pe toate' })).toBeTruthy();
  });

  it('«Отметить прочитанным» снимает пометку «Новое» и уменьшает число в колокольчике', async () => {
    const api = withMarking([item(1, 'rate_dish'), item(2, 'complaint_resolved')]);
    const ui = userEvent.setup();
    renderComponent(BELL_AND_PAGE, '/notifications');
    await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 2' });
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);
    // новые первыми — порядок как у сервера: первая карточка это id 1
    await ui.click(within(cards[0]!).getByRole('button', { name: 'Отметить прочитанным' }));
    await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 1' });
    expect(api.callsTo('POST /notifications/1/read')).toHaveLength(1);
    expect(within(screen.getAllByRole('article')[0]!).queryByText('Новое')).toBeNull();
    expect(within(screen.getAllByRole('article')[1]!).getByText('Новое')).toBeTruthy();
  });

  it('«Прочитать все» отмечает всё, кнопка исчезает', async () => {
    const api = withMarking([item(1, 'rate_dish'), item(2, 'rate_dish')]);
    const ui = userEvent.setup();
    renderComponent(BELL_AND_PAGE, '/notifications');
    await ui.click(await screen.findByRole('button', { name: 'Прочитать все' }));
    await screen.findByRole('link', { name: 'Уведомления' });
    expect(api.callsTo('POST /notifications/read-all')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Прочитать все' })).toBeNull();
    expect(screen.queryByText('Новое')).toBeNull();
  });

  it('ссылка «Открыть» из данных ведёт внутрь приложения и отмечает уведомление прочитанным', async () => {
    const api = withMarking([item(1, 'rate_dish', { link: '/orders/5' })]);
    const ui = userEvent.setup();
    renderAt('/notifications');
    const open = await screen.findByRole('link', { name: 'Открыть' });
    expect(open.getAttribute('href')).toBe('/orders/5');
    await ui.click(open);
    await waitFor(() => expect(api.callsTo('POST /notifications/1/read')).toHaveLength(1));
  });

  it('чужие адреса в ссылке (наружу) не превращаются в кнопку', async () => {
    withMarking([
      item(1, 'rate_dish', { link: 'https://evil.example/x' }),
      item(2, 'rate_dish', { link: '//evil.example' }),
    ]);
    renderAt('/notifications');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('link', { name: 'Открыть' })).toBeNull();
  });

  it('пусто: понятный текст на обоих языках', async () => {
    withMarking([]);
    renderAt('/notifications');
    expect(await screen.findByText('Уведомлений пока нет.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Прочитать все' })).toBeNull();
    cleanUp();
    resetNotifications();
    document.body.innerHTML = '';
    withMarking([]);
    renderAt('/notifications', 'ro');
    expect(await screen.findByText('Nu aveți încă notificări.')).toBeTruthy();
  });

  it('без входа ведёт на экран входа', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderAt('/notifications');
    expect(await screen.findByLabelText('Номер телефона')).toBeTruthy();
  });

  it('ошибка загрузки показывается и есть кнопка «Повторить»', async () => {
    let fail = true;
    installFakeApi({
      'GET /auth/me': () => ({ body: { user: user() } }),
      'GET /notifications': () =>
        fail
          ? {
              status: 500,
              body: {
                error: { code: 'internal_error', messageKey: 'core.error.generic', message: 'x' },
              },
            }
          : { body: { items: [], unreadCount: 0 } },
    });
    const ui = userEvent.setup();
    renderAt('/notifications');
    expect(await screen.findByText('Не удалось загрузить уведомления.')).toBeTruthy();
    fail = false;
    await ui.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Уведомлений пока нет.')).toBeTruthy();
  });

  it('доступность списка', async () => {
    withMarking([
      item(1, 'rate_dish', { link: '/orders/5' }),
      item(2, 'system_alert', { kind: 'sms_failed', count: 3 }),
    ]);
    renderAt('/notifications');
    await screen.findAllByRole('article');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
