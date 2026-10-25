import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { ConsentsForm } from '../../src/features/client/auth/ConsentsForm.tsx';
import { apiError, grantedConsents, installFakeApi } from './fakeApi.ts';
import { cleanUp, renderComponent } from './render.tsx';

afterEach(cleanUp);

const VERSION = '2026-10-25';

describe('форма согласий', () => {
  it('каждое согласие — отдельная галочка с текстом-заглушкой [ВПИШИ] и версией', async () => {
    installFakeApi({ 'GET /auth/consents': () => ({ body: grantedConsents() }) });
    renderComponent(
      <ConsentsForm kinds={['terms', 'privacy', 'health_data']} onSaved={() => undefined} />,
    );
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByLabelText('Я принимаю условия использования')).toBeTruthy();
    expect(screen.getByLabelText('Я принимаю политику конфиденциальности')).toBeTruthy();
    expect(
      screen.getByLabelText(/отдельное согласие на обработку данных о моём здоровье/),
    ).toBeTruthy();
    expect(screen.getAllByText(/\[ВПИШИ\]/)).toHaveLength(3);
    expect(screen.getAllByText(`Версия текста: ${VERSION}`)).toHaveLength(3);
  });

  it('уже данные согласия отмечены', async () => {
    installFakeApi({ 'GET /auth/consents': () => ({ body: grantedConsents({ terms: true }) }) });
    renderComponent(<ConsentsForm kinds={['terms', 'privacy']} onSaved={() => undefined} />);
    expect(
      ((await screen.findByLabelText('Я принимаю условия использования')) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText('Я принимаю политику конфиденциальности') as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('без обязательной галочки запрос не уходит и показывается подсказка', async () => {
    const api = installFakeApi({ 'GET /auth/consents': () => ({ body: grantedConsents() }) });
    const saved = vi.fn();
    const ui = userEvent.setup();
    renderComponent(
      <ConsentsForm kinds={['terms', 'privacy']} required={['terms', 'privacy']} onSaved={saved} />,
    );
    await ui.click(await screen.findByLabelText('Я принимаю условия использования'));
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Отметьте условия и политику, чтобы продолжить.',
    );
    expect(api.callsTo('POST /auth/consents')).toHaveLength(0);
    expect(saved).not.toHaveBeenCalled();
  });

  it('сохранение отправляет решение по каждому виду с версией текста, потом вызывает onSaved', async () => {
    const api = installFakeApi({
      'GET /auth/consents': () => ({ body: grantedConsents() }),
      'POST /auth/consents': () => ({ body: grantedConsents({ terms: true, privacy: true }) }),
    });
    const saved = vi.fn();
    const ui = userEvent.setup();
    renderComponent(
      <ConsentsForm kinds={['terms', 'privacy']} required={['terms', 'privacy']} onSaved={saved} />,
    );
    await ui.click(await screen.findByLabelText('Я принимаю условия использования'));
    await ui.click(screen.getByLabelText('Я принимаю политику конфиденциальности'));
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(api.callsTo('POST /auth/consents')[0]!.body).toEqual({
      changes: [
        { kind: 'terms', granted: true, version: VERSION },
        { kind: 'privacy', granted: true, version: VERSION },
      ],
    });
  });

  it('галочку на данные о здоровье можно оставить пустой, если она не обязательна: отправляется отказ', async () => {
    const api = installFakeApi({
      'GET /auth/consents': () => ({ body: grantedConsents({ terms: true }) }),
      'POST /auth/consents': () => ({ body: grantedConsents({ terms: true }) }),
    });
    const ui = userEvent.setup();
    renderComponent(<ConsentsForm kinds={['terms', 'health_data']} onSaved={() => undefined} />);
    await screen.findByLabelText('Я принимаю условия использования');
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    await waitFor(() => expect(api.callsTo('POST /auth/consents')).toHaveLength(1));
    expect(
      (api.callsTo('POST /auth/consents')[0]!.body as { changes: unknown[] }).changes,
    ).toContainEqual({
      kind: 'health_data',
      granted: false,
      version: VERSION,
    });
  });

  it('ошибка сохранения показывается, onSaved не вызывается', async () => {
    installFakeApi({
      'GET /auth/consents': () => ({ body: grantedConsents() }),
      'POST /auth/consents': () => apiError(400, 'consent_version', 'auth.error.consentVersion'),
    });
    const saved = vi.fn();
    const ui = userEvent.setup();
    renderComponent(<ConsentsForm kinds={['terms']} required={['terms']} onSaved={saved} />);
    await ui.click(await screen.findByLabelText('Я принимаю условия использования'));
    await ui.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Текст согласия обновился. Откройте его заново и подтвердите.',
    );
    expect(saved).not.toHaveBeenCalled();
  });

  it('румынский интерфейс и доступность', async () => {
    installFakeApi({ 'GET /auth/consents': () => ({ body: grantedConsents() }) });
    renderComponent(
      <ConsentsForm kinds={['terms', 'privacy', 'health_data']} onSaved={() => undefined} />,
      '/',
      'ro',
    );
    expect(await screen.findByLabelText('Accept condițiile de utilizare')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuă' })).toBeTruthy();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
