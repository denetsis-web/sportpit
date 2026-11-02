import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { asClient, cleanUp, installFake, renderAt } from '../feedback/fixtures.tsx';

afterEach(cleanUp);

const ZERO = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 };
const TARGET = { calories: 2000, proteinG: 150, fatG: 60, carbsG: 220, fiberG: 30 };

const day = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-03-10',
  today: '2026-03-10',
  total: ZERO,
  boxes: [],
  entries: [],
  target: null,
  targetBlocked: false,
  empty: true,
  ...overrides,
});

const entry = {
  id: 7,
  date: '2026-03-10',
  name: 'Йогурт',
  calories: 150,
  proteinG: 15,
  fatG: 4,
  carbsG: 12,
  fiberG: 0,
  createdAt: '2026-03-10T09:00:00.000Z',
};

describe('трекер питания (R04, R28)', () => {
  it('пустое состояние: приглашение и кнопка «Выбрать блюда» ведёт в меню', async () => {
    installFake({ ...asClient, 'GET /tracker/day': () => ({ body: day() }) });
    renderAt('/tracker');
    expect(await screen.findByText('За этот день пока ничего нет')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Выбрать блюда' }).getAttribute('href')).toBe('/menu');
  });

  it('прогресс дня: калории и БЖУ с клетчаткой против нормы, выданный бокс и ручная запись', async () => {
    installFake({
      ...asClient,
      'GET /tracker/day': () => ({
        body: day({
          empty: false,
          target: TARGET,
          total: { calories: 670, proteinG: 57, fatG: 18, carbsG: 67, fiberG: 6 },
          boxes: [
            {
              orderId: 'o1',
              calories: 520,
              proteinG: 42,
              fatG: 14,
              carbsG: 55,
              fiberG: 6,
              items: [{ dishId: 1, name: { ru: 'Курица с рисом', ro: 'Pui cu orez' }, qty: 1 }],
            },
          ],
          entries: [entry],
        }),
      }),
    });
    const { container } = renderAt('/tracker');
    expect(await screen.findByText('Калории: 670 ккал из 2000 ккал')).toBeTruthy();
    expect(screen.getByText('Белки: 57 г из 150 г')).toBeTruthy();
    expect(screen.getByText('Клетчатка: 6 г из 30 г')).toBeTruthy();
    expect(screen.getByText(/Курица с рисом × 1/)).toBeTruthy();
    expect(screen.getByText('Йогурт')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Калории' });
    expect(bar.getAttribute('max')).toBe('2000');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('без анкеты цели нет: подсказка и ссылка на анкету, а при «обратитесь к врачу» — другой текст', async () => {
    installFake({
      ...asClient,
      'GET /tracker/day': () => ({
        body: day({ empty: false, total: { ...ZERO, calories: 100 }, entries: [entry] }),
      }),
    });
    renderAt('/tracker');
    expect(await screen.findByText(/Заполните анкету цели/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Заполнить анкету' }).getAttribute('href')).toBe(
      '/profile',
    );
    expect(screen.getByText('Калории: 100 ккал')).toBeTruthy();
  });

  it('ручная запись: отрицательное число не уходит на сервер, верная запись отправляется', async () => {
    const created = vi.fn(() => ({ status: 201, body: { entry } }));
    const api = installFake({
      ...asClient,
      'GET /tracker/day': () => ({ body: day() }),
      'POST /tracker/entries': created,
    });
    const user = userEvent.setup();
    renderAt('/tracker');
    await user.click(await screen.findByRole('button', { name: 'Добавить запись' }));
    await user.type(screen.getByLabelText('Название'), 'Йогурт');
    await user.type(screen.getByLabelText('Калории, ккал'), '-5');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Введите число от 0, без минуса.')).toBeTruthy();
    expect(created).not.toHaveBeenCalled();

    const kcal = screen.getByLabelText('Калории, ккал');
    await user.clear(kcal);
    await user.type(kcal, '150');
    await user.type(screen.getByLabelText('Белки, г'), '15');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(api.callsTo('POST /tracker/entries')[0]!.body).toEqual({
      date: '2026-03-10',
      name: 'Йогурт',
      calories: 150,
      proteinG: 15,
      fatG: 0,
      carbsG: 0,
      fiberG: 0,
    });
  });

  it('запись можно удалить после подтверждения', async () => {
    const removed = vi.fn(() => ({ body: { deleted: true } }));
    installFake({
      ...asClient,
      'GET /tracker/day': () => ({
        body: day({ empty: false, total: { ...ZERO, calories: 150 }, entries: [entry] }),
      }),
      'DELETE /tracker/entries/7': removed,
    });
    const user = userEvent.setup();
    renderAt('/tracker');
    await user.click(await screen.findByRole('button', { name: 'Удалить запись «Йогурт»' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  });

  it('неделя: суммы по дням в таблице, цель из анкеты и переход к дню', async () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-03-${String(9 + i).padStart(2, '0')}`,
      total: { ...ZERO, calories: i === 1 ? 1800 : 0 },
      boxes: i === 1 ? 1 : 0,
      entries: 0,
    }));
    installFake({
      ...asClient,
      'GET /tracker/day': () => ({ body: day() }),
      'GET /tracker/week': () => ({
        body: {
          from: '2026-03-09',
          to: '2026-03-15',
          today: '2026-03-10',
          days,
          target: TARGET,
          targetBlocked: false,
          empty: false,
        },
      }),
    });
    const user = userEvent.setup();
    renderAt('/tracker');
    await user.click(await screen.findByRole('button', { name: 'Неделя' }));
    expect(await screen.findByText('Цель: 2000 ккал в день')).toBeTruthy();
    const row = screen.getByRole('row', { name: /10\.03\.2026/ });
    expect(within(row).getByText('1800 ккал')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(8);
  });
});
