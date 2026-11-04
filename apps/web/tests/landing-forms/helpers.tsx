import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { cleanUp as baseCleanUp } from '../landing/render.tsx';
import { resetPrefill } from '../../src/features/client/landing/join/prefill.ts';

export { open, serve } from '../landing/render.tsx';

/** Страница прорисована: виден заголовок первого экрана. */
export const ready = () => screen.findByRole('heading', { level: 1 });

export function cleanUp(): void {
  baseCleanUp();
  resetPrefill();
  window.localStorage.clear();
}

export const section = (id: 'calc' | 'join') => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`нет секции #${id}`);
  return within(element);
};

export interface CalcAnswers {
  sex: string;
  age: string;
  height: string;
  weight: string;
  goal: string;
  activity: string;
}

/** Пример из packages/shared/tests/targets.test.ts: мужчина, 30 лет, 180 см, 80 кг, похудение, умеренная активность. */
export const EXAMPLE: CalcAnswers = {
  sex: 'Мужской',
  age: '30',
  height: '180',
  weight: '80',
  goal: 'lose',
  activity: 'moderate',
};

const RU_LABELS = {
  age: 'Возраст, лет',
  height: 'Рост, см',
  weight: 'Вес, кг',
  goal: 'Цель',
  activity: 'Активность',
};

export async function fillCalc(
  ui: UserEvent,
  answers: CalcAnswers,
  labels = RU_LABELS,
): Promise<void> {
  const calc = section('calc');
  await ui.click(calc.getByLabelText(answers.sex));
  for (const key of ['age', 'height', 'weight'] as const) {
    const input = calc.getByLabelText(labels[key]);
    await ui.clear(input);
    await ui.type(input, answers[key]);
  }
  await ui.selectOptions(calc.getByLabelText(labels.goal), answers.goal);
  await ui.selectOptions(calc.getByLabelText(labels.activity), answers.activity);
}
