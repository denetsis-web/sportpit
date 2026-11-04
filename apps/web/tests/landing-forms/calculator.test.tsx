import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { cleanUp, EXAMPLE, fillCalc, open, ready, section, serve } from './helpers.tsx';

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanUp);

const RESULT = 'Твоя норма на день';
const calculate = (ui: ReturnType<typeof userEvent.setup>) =>
  ui.click(section('calc').getByRole('button', { name: 'Рассчитать' }));

describe('калькулятор нормы: расчёт', () => {
  it('пример из targets.test.ts даёт 2345 ккал и 160 г белка (та же calcTargets, что в анкете)', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await fillCalc(ui, EXAMPLE);
    await calculate(ui);
    const result = await section('calc').findByRole('region', { name: RESULT });
    const figures = within(result);
    expect(figures.getByText('2345')).toBeTruthy();
    expect(figures.getByText('160')).toBeTruthy(); // белок
    expect(figures.getByText('65')).toBeTruthy(); // жиры
    expect(figures.getByText('280')).toBeTruthy(); // углеводы
    expect(figures.getByText('33')).toBeTruthy(); // клетчатка
  });

  it('неверные данные: ошибки у полей, введённое остаётся, результата нет', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await fillCalc(ui, { ...EXAMPLE, age: '5', height: '90' });
    await calculate(ui);
    const calc = section('calc');
    const age = calc.getByLabelText('Возраст, лет') as HTMLInputElement;
    expect(age.getAttribute('aria-invalid')).toBe('true');
    expect(age.value).toBe('5');
    expect(calc.getByText('Введи число от 10 до 110.')).toBeTruthy();
    expect(calc.getByText('Введи число от 100 до 250.')).toBeTruthy();
    expect((calc.getByLabelText('Рост, см') as HTMLInputElement).value).toBe('90');
    expect(calc.queryByRole('region', { name: RESULT })).toBeNull();
  });

  it('пустая форма: у каждого поля понятная просьба заполнить или выбрать', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await calculate(ui);
    const calc = section('calc');
    expect(calc.getAllByText('Заполни поле.').length).toBe(3);
    expect(calc.getAllByText('Выбери вариант.').length).toBe(3);
  });

  it('возраст вне 18–80 и отметка об ограничениях дают «обратитесь к врачу» вместо цифр', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await fillCalc(ui, { ...EXAMPLE, age: '17' });
    await calculate(ui);
    const calc = section('calc');
    expect(await calc.findByText('Обратитесь к врачу')).toBeTruthy();
    expect(calc.queryByText('2345')).toBeNull();

    const age = calc.getByLabelText('Возраст, лет');
    await ui.clear(age);
    await ui.type(age, '30');
    await ui.click(calc.getByLabelText(/диабет, беременность/));
    await calculate(ui);
    expect(await calc.findByText('Обратитесь к врачу')).toBeTruthy();
    expect(calc.queryByText('2345')).toBeNull();
  });

  it('подпись про ориентировочность стоит под результатом', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await fillCalc(ui, EXAMPLE);
    await calculate(ui);
    const calc = section('calc');
    const result = await calc.findByRole('region', { name: RESULT });
    const note = calc.getByText('Ориентировочно, не медицинская рекомендация.');
    expect(result.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('на румынском: подписи, ошибки и подпись про ориентировочность', async () => {
    const ui = userEvent.setup();
    serve();
    open('/ro', 'ro');
    await ready();
    const calc = section('calc');
    await ui.click(calc.getByRole('button', { name: 'Calculează' }));
    expect(calc.getAllByText('Completează câmpul.').length).toBe(3);
    await fillCalc(
      ui,
      {
        sex: 'Masculin',
        age: '30',
        height: '180',
        weight: '80',
        goal: 'lose',
        activity: 'moderate',
      },
      {
        age: 'Vârsta, ani',
        height: 'Înălțimea, cm',
        weight: 'Greutatea, kg',
        goal: 'Obiectiv',
        activity: 'Activitate',
      },
    );
    await ui.click(calc.getByRole('button', { name: 'Calculează' }));
    const result = await calc.findByRole('region', { name: 'Norma ta pe zi' });
    expect(within(result).getByText('2345')).toBeTruthy();
    const note = calc.getByText('Orientativ, nu este o recomandare medicală.');
    expect(result.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('калькулятор нормы: ввод не сохраняется и не уходит', () => {
  it('ни одного запроса с цифрами, в хранилищах нет ввода, calc_used — только вид и атрибуция', async () => {
    const ui = userEvent.setup();
    const api = serve();
    open('/');
    await ready();
    await fillCalc(ui, EXAMPLE);
    await calculate(ui);
    await section('calc').findByRole('region', { name: RESULT });

    await waitFor(() => {
      const events = api.callsTo('POST /track').map((call) => call.body);
      expect(events).toContainEqual({ kind: 'calc_used', attribution: { source: 'direct' } });
    });
    const sent = JSON.stringify(api.calls.map((call) => [call.method, call.path, call.body]));
    expect(sent).not.toMatch(/180|2345|"lose"|moderate|heightCm|weightKg/);
    // записей на сервер при расчёте нет, кроме событий воронки
    for (const call of api.calls.filter((c) => c.method !== 'GET')) {
      expect(call.path).toBe('/track');
    }

    const stored = JSON.stringify([{ ...window.localStorage }, { ...window.sessionStorage }]);
    expect(stored).not.toMatch(/180|2345|lose|moderate|male/);
  });
});

describe('калькулятор нормы: переход к форме', () => {
  it('кнопка под результатом ведёт к #join, цель подставлена из расчёта', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await fillCalc(ui, EXAMPLE);
    await calculate(ui);
    const calc = section('calc');
    await calc.findByRole('region', { name: RESULT });
    const goal = section('join').getByLabelText('Цель (необязательно)') as HTMLSelectElement;
    expect(goal.value).toBe('');
    await ui.click(calc.getByRole('link', { name: 'Записаться в лист ожидания' }));
    expect(goal.value).toBe('lose');
    expect(document.activeElement?.id).toBe('join');
  });
});

describe('калькулятор нормы: доступность', () => {
  it('секция с результатом проходит axe', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await fillCalc(ui, EXAMPLE);
    await calculate(ui);
    await section('calc').findByRole('region', { name: RESULT });
    expect(await axe(document.getElementById('calc')!)).toHaveNoViolations();
  });

  it('секция с ошибками проходит axe', async () => {
    const ui = userEvent.setup();
    serve();
    open('/');
    await ready();
    await calculate(ui);
    expect(section('calc').getAllByRole('alert').length).toBeGreaterThan(0);
    expect(await axe(document.getElementById('calc')!)).toHaveNoViolations();
  });
});
