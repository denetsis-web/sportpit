import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { renderApp } from '../helpers.tsx';

// Настоящие функции этого таска вместе со входом, подключённые так же, как это делает оболочка.
export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,profile,onboarding}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules }, { lang });
}

export const VERSION = '2026-10-25';

/** Анкета: мужчина 30 лет, 180 см, 80 кг, похудение, умеренная активность. */
export const SAMPLE_PROFILE = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goal: 'lose',
  activity: 'moderate',
  hasCondition: false,
  updatedAt: '2026-03-10T09:00:00.000Z',
} as const;

/** Норма для SAMPLE_PROFILE, посчитанная вручную (packages/shared/tests/targets.test.ts). */
export const SAMPLE_TARGETS = {
  kcal: 2345,
  proteinG: 160,
  proteinRangeG: { min: 128, max: 176 },
  fatG: 65,
  carbG: 280,
  fiberG: 33,
  floorApplied: false,
} as const;
