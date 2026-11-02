import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { cleanUp } from '../auth/render.tsx';
import { renderAt } from '../menu/fixtures.tsx';
import { admin, fail, installFake } from './fake.ts';

// формы набираются по символам: при полном прогоне на нагруженной машине 5 секунд мало

afterEach(cleanUp);

const dish = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
  composition: { ru: 'куриная грудка, рис', ro: 'piept de pui, orez' },
  calories: 520,
  proteinG: 42.5,
  fatG: 14,
  carbsG: 55,
  fiberG: 6,
  weightG: 380,
  allergens: ['gluten'],
  goals: ['maintain'],
  vegetarian: false,
  shelfLifeHours: 72,
  photoUrl: null,
  active: true,
  ...over,
});

describe('админка: блюда (R36)', () => {
  it('создание: названия и составы RU/RO, КБЖУ числами, аллергены, цели и срок хранения уходят на сервер', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/dishes': () => ({ body: { items: [] } }),
      'POST /admin/dishes': () => ({ status: 201, body: dish() }),
    });
    renderAt('/admin/dishes');
    await ui.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    await ui.type(screen.getByLabelText('Название (русский)'), 'Курица с рисом');
    await ui.type(screen.getByLabelText('Название (румынский)'), 'Pui cu orez');
    await ui.type(screen.getByLabelText('Состав (русский)'), 'куриная грудка, рис');
    await ui.type(screen.getByLabelText('Состав (румынский)'), 'piept de pui, orez');
    await ui.type(screen.getByLabelText('Ккал'), '520');
    await ui.type(screen.getByLabelText('Белок, г'), '42,5');
    await ui.type(screen.getByLabelText('Жиры, г'), '14');
    await ui.type(screen.getByLabelText('Углеводы, г'), '55');
    await ui.type(screen.getByLabelText('Клетчатка, г'), '6');
    await ui.type(screen.getByLabelText('Вес порции, г'), '380');
    await ui.click(screen.getByLabelText('глютен'));
    await ui.click(screen.getByLabelText('Поддержание'));
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.callsTo('POST /admin/dishes')).toHaveLength(1));
    expect(api.callsTo('POST /admin/dishes')[0]!.body).toEqual({
      nameRu: 'Курица с рисом',
      nameRo: 'Pui cu orez',
      compositionRu: 'куриная грудка, рис',
      compositionRo: 'piept de pui, orez',
      calories: 520,
      proteinG: 42.5,
      fatG: 14,
      carbsG: 55,
      fiberG: 6,
      weightG: 380,
      shelfLifeHours: 72,
      allergens: ['gluten'],
      goals: ['maintain'],
      vegetarian: false,
      active: true,
    });
  });

  it('ошибки проверки показываются у своих полей; пустое число уходит как null и не подменяется нулём', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/dishes': () => ({ body: { items: [] } }),
      'POST /admin/dishes': () =>
        fail(400, 'validation_failed', 'core.error.validation', {
          nameRo: 'catalog.error.name',
          calories: 'core.error.validation',
        }),
    });
    renderAt('/admin/dishes');
    await ui.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBe(2));
    expect(screen.getByText('Название обязательно, не длиннее 120 знаков.')).toBeTruthy();
    expect(
      (api.callsTo('POST /admin/dishes')[0]!.body as { calories: unknown }).calories,
    ).toBeNull();
  });

  it('правка: форма заполнена значениями блюда, уходит PATCH; отключённое блюдо помечено', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/dishes': () => ({ body: { items: [dish({ active: false })] } }),
      'PATCH /admin/dishes/1': () => ({ body: dish() }),
    });
    renderAt('/admin/dishes');
    expect(await screen.findByText('Отключено')).toBeTruthy();
    expect(screen.getByText('520 ккал · Б 42,5 · Ж 14 · У 55')).toBeTruthy();
    await ui.click(screen.getByRole('button', { name: 'Изменить' }));
    expect((screen.getByLabelText('Белок, г') as HTMLInputElement).value).toBe('42,5');
    expect((screen.getByLabelText('глютен') as HTMLInputElement).checked).toBe(true);
    await ui.click(screen.getByLabelText('Включено'));
    await ui.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.callsTo('PATCH /admin/dishes/1')).toHaveLength(1));
    expect(api.callsTo('PATCH /admin/dishes/1')[0]!.body).toMatchObject({
      active: true,
      proteinG: 42.5,
      allergens: ['gluten'],
    });
  });

  it('фото: JPEG уходит файлом на сервер, GIF и файл больше 5 МБ отклоняются до отправки', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/dishes': () => ({ body: { items: [dish()] } }),
      'POST /admin/dishes/1/photo': () => ({
        body: dish({ photoUrl: '/api/v1/files/dishes/1-abc.jpg' }),
      }),
    });
    renderAt('/admin/dishes');
    await ui.click(await screen.findByRole('button', { name: 'Изменить' }));
    const input = screen.getByLabelText('Загрузить фото') as HTMLInputElement;

    // userEvent.upload учитывает accept, поэтому «чужие» файлы кладём событием напрямую
    const { fireEvent } = await import('@testing-library/react');
    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [gif] } });
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Фото должно быть в формате JPEG или PNG.',
    );

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [big] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Фото больше 5 МБ.'));
    expect(api.callsTo('POST /admin/dishes/1/photo')).toHaveLength(0);

    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'ok.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [jpeg] } });
    await waitFor(() => expect(api.callsTo('POST /admin/dishes/1/photo')).toHaveLength(1));
    const sent = api.callsTo('POST /admin/dishes/1/photo')[0]!.form!.get('photo') as File;
    expect(sent.name).toBe('ok.jpg');
    expect(sent.type).toBe('image/jpeg');
    expect(await screen.findByRole('button', { name: 'Удалить фото' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ответ сервера «неверный тип» (по содержимому) показывается пользователем', async () => {
    const ui = userEvent.setup();
    installFake({
      ...admin,
      'GET /admin/dishes': () => ({ body: { items: [dish()] } }),
      'POST /admin/dishes/1/photo': () => fail(415, 'photo_type', 'catalog.error.photoType'),
    });
    renderAt('/admin/dishes');
    await ui.click(await screen.findByRole('button', { name: 'Изменить' }));
    await ui.upload(
      screen.getByLabelText('Загрузить фото'),
      new File(['x'], 'fake.jpg', { type: 'image/jpeg' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Фото должно быть в формате JPEG или PNG.',
    );
  });

  it('удаление фото отправляет DELETE и убирает кнопку', async () => {
    const ui = userEvent.setup();
    const api = installFake({
      ...admin,
      'GET /admin/dishes': () => ({
        body: { items: [dish({ photoUrl: '/api/v1/files/dishes/1-abc.jpg' })] },
      }),
      'DELETE /admin/dishes/1/photo': () => ({ body: dish() }),
    });
    renderAt('/admin/dishes');
    await ui.click(await screen.findByRole('button', { name: 'Изменить' }));
    await ui.click(screen.getByRole('button', { name: 'Удалить фото' }));
    await waitFor(() => expect(api.callsTo('DELETE /admin/dishes/1/photo')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Удалить фото' })).toBeNull());
  });

  it('нет автоматических нарушений доступности', async () => {
    const ui = userEvent.setup();
    installFake({ ...admin, 'GET /admin/dishes': () => ({ body: { items: [dish()] } }) });
    const { container } = renderAt('/admin/dishes');
    await ui.click(await screen.findByRole('button', { name: 'Изменить' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
