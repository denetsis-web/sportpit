// Проверка полей калькулятора и расчёт. Без React и без сети: ввод посетителя нигде не сохраняется.
// Расчёт делает та же функция `calcTargets`, что и анкета; границы полей — `PROFILE_LIMITS`, схема — `profileInputSchema`.
import {
  PROFILE_LIMITS,
  profileInputSchema,
  type ProfileData,
} from '@sportpit/shared/schemas/profile';
import {
  ACTIVITY_LEVELS,
  calcTargets,
  GOALS,
  SEXES,
  type TargetsResult,
} from '@sportpit/shared/targets';

export type CalcField = 'sex' | 'age' | 'height' | 'weight' | 'goal' | 'activity';

/** Значения полей как их ввёл человек: числа — текстом. */
export interface CalcValues {
  sex: string;
  age: string;
  height: string;
  weight: string;
  goal: string;
  activity: string;
  hasCondition: boolean;
}

export const EMPTY_CALC: CalcValues = {
  sex: '',
  age: '',
  height: '',
  weight: '',
  goal: '',
  activity: '',
  hasCondition: false,
};

/** Что не так с полем; текст подбирает форма по ключу. */
export type CalcFieldError =
  { kind: 'required' | 'choose' | 'integer' } | { kind: 'range'; min: number; max: number };

export type CalcErrors = Partial<Record<CalcField, CalcFieldError>>;

/** Число из текста: запятая как точка; всё, что не похоже на число, — `NaN`. */
export function parseNumber(text: string): number {
  const clean = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : Number.NaN;
}

function checkNumber(
  text: string,
  limits: { min: number; max: number },
  integer: boolean,
): CalcFieldError | null {
  if (text.trim() === '') return { kind: 'required' };
  const value = parseNumber(text);
  if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
    return { kind: 'range', min: limits.min, max: limits.max };
  }
  return integer && !Number.isInteger(value) ? { kind: 'integer' } : null;
}

const oneOf = (values: readonly string[], value: string) => values.includes(value);

export type CalcCheck = { ok: true; input: ProfileData } | { ok: false; errors: CalcErrors };

/** Проверяет поля тем же набором границ, что анкета профиля. */
export function validateCalc(values: CalcValues): CalcCheck {
  const errors: CalcErrors = {};
  if (!oneOf(SEXES, values.sex)) errors.sex = { kind: 'choose' };
  const age = checkNumber(values.age, PROFILE_LIMITS.age, true);
  if (age) errors.age = age;
  const height = checkNumber(values.height, PROFILE_LIMITS.heightCm, true);
  if (height) errors.height = height;
  const weight = checkNumber(values.weight, PROFILE_LIMITS.weightKg, false);
  if (weight) errors.weight = weight;
  if (!oneOf(GOALS, values.goal)) errors.goal = { kind: 'choose' };
  if (!oneOf(ACTIVITY_LEVELS, values.activity)) errors.activity = { kind: 'choose' };
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = profileInputSchema.safeParse({
    sex: values.sex,
    age: parseNumber(values.age),
    heightCm: parseNumber(values.height),
    weightKg: parseNumber(values.weight),
    goal: values.goal,
    activity: values.activity,
    hasCondition: values.hasCondition,
  });
  if (!parsed.success) return { ok: false, errors: { age: { kind: 'required' } } };
  return { ok: true, input: parsed.data };
}

/** Норма на день; возраст вне 18–80 и отметка об ограничениях дают `blocked` вместо цифр. */
export const computeNorm = (input: ProfileData): TargetsResult => calcTargets(input);
