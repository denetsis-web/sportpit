import { fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { apiError } from '../auth/fakeApi.ts';
import { cleanUp, open, ready, section, serve } from './helpers.tsx';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanUp);

const OK = () => ({ body: { ok: true } });
const submitButton = () => section('join').getByRole('button', { name: 'Записаться' });

/** Вводит телефон (поле начинается с +373) и отмечает согласие. */
async function fill(ui: ReturnType<typeof userEvent.setup>, phone = '+373 600 12 345') {
  const join = section('join');
  const input = join.getByLabelText('Телефон');
  await ui.clear(input);
  await ui.type(input, phone);
  await ui.click(join.getByRole('checkbox'));
}

describe('форма листа ожидания: отправка', () => {
  it('телефон очищается как в логине, на сервер уходит язык страницы, атрибуция и приманка', async () => {
    const ui = userEvent.setup();
    const api = serve({ 'POST /waitlist': OK });
    open('/?src=gym&ref=hall7');
    await ready();
    const join = section('join');
    await fill(ui);
    await ui.type(join.getByLabelText('Имя (необязательно)'), 'Анна');
    await ui.type(join.getByLabelText('Зал или район'), 'Ботаника');
    await ui.selectOptions(join.getByLabelText('Цель (необязательно)'), 'gain');
    await ui.click(submitButton());
    await join.findByText('Записали');

    const calls = api.callsTo('POST /waitlist');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      phone: '+37360012345',
      name: 'Анна',
      gym: 'Ботаника',
      goal: 'gain',
      lang: 'ru',
      consent: true,
      website: '',
      attribution: { source: 'gym', ref: 'hall7' },
    });
    expect(calls[0]!.headers['x-requested-with']).toBe('sportpit');
  });

  it('на /ro уходит lang ro и подписи румынские', async () => {
    const ui = userEvent.setup();
    const api = serve({ 'POST /waitlist': OK });
    open('/ro', 'ro');
    await ready();
    const join = section('join');
    const phone = join.getByLabelText('Telefon');
    await ui.clear(phone);
    await ui.type(phone, '+37360012345');
    await ui.click(join.getByRole('checkbox'));
    await ui.click(join.getByRole('button', { name: 'Înscrie-te' }));
    await join.findByText('Te-am înscris');
    expect((api.callsTo('POST /waitlist')[0]!.body as { lang: string }).lang).toBe('ro');
  });

  it('скрытое поле-приманка невидимо для клавиатуры и скринридера, его значение уходит на сервер', async () => {
    const ui = userEvent.setup();
    const api = serve({ 'POST /waitlist': OK });
    open('/');
    await ready();
    const join = section('join');
    const trap = document.querySelector('#join input[name="website"]') as HTMLInputElement;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(trap.autocomplete).toBe('off');
    expect(trap.value).toBe('');
    fireEvent.change(trap, { target: { value: 'http://spam.example' } });
    await fill(ui);
    await ui.click(submitButton());
    await join.findByText('Записали');
    expect((api.callsTo('POST /waitlist')[0]!.body as { website: string }).website).toBe(
      'http://spam.example',
    );
  });

  it('согласие не отмечено по умолчанию, без него запрос не уходит, показано сообщение', async () => {
    const ui = userEvent.setup();
    const api = serve({ 'POST /waitlist': OK });
    open('/');
    await ready();
    const join = section('join');
    const consent = join.getByRole('checkbox') as HTMLInputElement;
    expect(consent.checked).toBe(false);
    const phone = join.getByLabelText('Телефон');
    await ui.clear(phone);
    await ui.type(phone, '+37360012345');
    await ui.click(submitButton());
    expect(join.getByText('Без согласия записать тебя в список не получится.')).toBeTruthy();
    expect(consent.getAttribute('aria-invalid')).toBe('true');
    expect(api.callsTo('POST /waitlist')).toHaveLength(0);
  });

  it('неверный телефон: ошибка у поля, введённое остаётся, запроса нет', async () => {
    const ui = userEvent.setup();
    const api = serve({ 'POST /waitlist': OK });
    open('/');
    await ready();
    const join = section('join');
    await fill(ui, '+373 600 12');
    await ui.type(join.getByLabelText('Имя (необязательно)'), 'Анна');
    await ui.click(submitButton());
    const phone = join.getByLabelText('Телефон') as HTMLInputElement;
    expect(phone.getAttribute('aria-invalid')).toBe('true');
    expect(phone.value).toBe('+373 600 12');
    expect(join.getByText('Проверь номер: нужен формат +373XXXXXXXX.')).toBeTruthy();
    expect((join.getByLabelText('Имя (необязательно)') as HTMLInputElement).value).toBe('Анна');
    expect(api.callsTo('POST /waitlist')).toHaveLength(0);
  });

  it('текст согласия из словаря и ссылка на /legal', async () => {
    serve();
    open('/');
    await ready();
    const join = section('join');
    expect(join.getByText('[ВПИШИ]')).toBeTruthy();
    expect(
      join.getByRole('link', { name: 'Прочитать политику и условия' }).getAttribute('href'),
    ).toBe('/legal');
  });
});

describe('форма листа ожидания: ответ сервера', () => {
  it('на время запроса кнопка заблокирована, повторное нажатие запрос не дублирует', async () => {
    const ui = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = serve({
      'POST /waitlist': async () => {
        await gate;
        return OK();
      },
    });
    open('/');
    await ready();
    await fill(ui);
    await ui.click(submitButton());
    const busy = section('join').getByRole('button', { name: 'Отправляем…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await ui.click(busy);
    release();
    await section('join').findByText('Записали');
    expect(api.callsTo('POST /waitlist')).toHaveLength(1);
  });

  it('успех: подтверждение вместо формы, повторно отправить нельзя', async () => {
    const ui = userEvent.setup();
    serve({ 'POST /waitlist': OK });
    open('/');
    await ready();
    await fill(ui);
    await ui.click(submitButton());
    const join = section('join');
    expect(await join.findByText('Записали')).toBeTruthy();
    expect(join.getByText('Напишем, когда в твоём зале появится холодильник.')).toBeTruthy();
    expect(join.queryByRole('button', { name: 'Записаться' })).toBeNull();
    expect(join.queryByLabelText('Телефон')).toBeNull();
  });

  it('сбой сети: понятный текст, форма цела, можно отправить ещё раз', async () => {
    const ui = userEvent.setup();
    let fail = true;
    const api = serve({
      'POST /waitlist': () => {
        if (fail) throw new TypeError('offline');
        return OK();
      },
    });
    open('/');
    await ready();
    await fill(ui);
    await ui.click(submitButton());
    const join = section('join');
    expect(
      await join.findByText('Не получилось отправить. Проверь связь и попробуй ещё раз.'),
    ).toBeTruthy();
    expect((join.getByLabelText('Телефон') as HTMLInputElement).value).toBe('+373 600 12 345');
    expect((join.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fail = false;
    await ui.click(submitButton());
    await join.findByText('Записали');
    expect(api.callsTo('POST /waitlist')).toHaveLength(2);
  });

  it('лимит (429): текст про частые попытки, форма цела', async () => {
    const ui = userEvent.setup();
    serve({
      'POST /waitlist': () => apiError(429, 'rate_limited', 'growth.error.waitlistLimit'),
    });
    open('/');
    await ready();
    await fill(ui);
    await ui.click(submitButton());
    const join = section('join');
    expect(await join.findByText('Слишком много попыток. Попробуй позже.')).toBeTruthy();
    expect((join.getByLabelText('Телефон') as HTMLInputElement).value).toBe('+373 600 12 345');
    expect(join.queryByText('Записали')).toBeNull();
  });

  it('ошибка 400 по полям привязывается к полям', async () => {
    const ui = userEvent.setup();
    serve({
      'POST /waitlist': () =>
        apiError(400, 'validation_failed', 'auth.error.phone', undefined, {
          phone: 'auth.error.phone',
          name: 'core.error.validation',
        }),
    });
    open('/');
    await ready();
    await fill(ui);
    await ui.click(submitButton());
    const join = section('join');
    await waitFor(() =>
      expect(join.getByLabelText('Телефон').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(join.getByText('Проверь номер: нужен формат +373XXXXXXXX.')).toBeTruthy();
    expect(join.getByLabelText('Имя (необязательно)').getAttribute('aria-invalid')).toBe('true');
    expect(join.getByText('Проверь это поле.')).toBeTruthy();
  });

  it('прочий сбой сервера: общий текст', async () => {
    const ui = userEvent.setup();
    serve({ 'POST /waitlist': () => apiError(500, 'server_error', 'core.error.generic') });
    open('/');
    await ready();
    await fill(ui);
    await ui.click(submitButton());
    expect(await section('join').findByText('Что-то пошло не так. Попробуй ещё раз.')).toBeTruthy();
  });
});

describe('форма листа ожидания: доступность', () => {
  it('форма, ошибки и подтверждение проходят axe', async () => {
    const ui = userEvent.setup();
    serve({ 'POST /waitlist': OK });
    open('/');
    await ready();
    const root = document.getElementById('join')!;
    expect(await axe(root)).toHaveNoViolations();
    await ui.click(submitButton());
    expect(section('join').getAllByRole('alert').length).toBeGreaterThan(0);
    expect(await axe(root)).toHaveNoViolations();
    await fill(ui);
    await ui.click(submitButton());
    await section('join').findByText('Записали');
    expect(await axe(root)).toHaveNoViolations();
  });
});
