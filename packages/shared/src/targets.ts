// Норма калорий и БЖУ с клетчаткой (R16, R17). Чистая функция: одна и та же на сервере и в клиенте.
//
// Формула Миффлина-Сан Жеора, базовый обмен (ккал/сутки):
//   10·вес(кг) + 6,25·рост(см) − 5·возраст + 5 (мужчины) или − 161 (женщины).
// Дальше: × коэффициент активности (1,2 / 1,375 / 1,55 / 1,725), × поправка цели
// (похудение −15%, поддержание 0, набор +12%). Белок 2,0 / 1,6 / 1,8 г на кг (показывается диапазон
// 1,6–2,2), жиры 25% калорий, клетчатка 14 г на 1000 ккал, углеводы — остаток калорий.
// Округление: до целого, половина вверх; углеводы считаются от уже округлённых белка и жиров.
//
// Это не медицинская рекомендация: для флага состояния здоровья и возраста вне 18–80 лет норма не считается.
export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];

export const GOALS = ['lose', 'maintain', 'gain'] as const;
export type Goal = (typeof GOALS)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const;
export type Activity = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

/** Поправка калорийности по цели. */
export const GOAL_ADJUSTMENT: Record<Goal, number> = { lose: -0.15, maintain: 0, gain: 0.12 };

/** Белок, г на кг массы тела, по цели; показываемый диапазон — 1,6–2,2. */
export const PROTEIN_PER_KG: Record<Goal, number> = { lose: 2.0, maintain: 1.6, gain: 1.8 };
export const PROTEIN_RANGE_PER_KG = { min: 1.6, max: 2.2 } as const;

export const FAT_SHARE = 0.25;
export const FIBER_PER_1000_KCAL = 14;

/** Минимум безопасного уровня, ккал в сутки. */
export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

/** Возраст, для которого норма считается (включительно). */
export const MIN_AGE = 18;
export const MAX_AGE = 80;

export interface TargetsInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  activity: Activity;
  /** Отмечено состояние здоровья (диабет, беременность и т. п.): норма не считается. */
  hasCondition?: boolean;
}

export type BlockReason = 'medical_condition' | 'age_out_of_range';

export interface Targets {
  kcal: number;
  proteinG: number;
  /** Диапазон белка на весь день, г (1,6–2,2 г на кг). */
  proteinRangeG: { min: number; max: number };
  fatG: number;
  carbG: number;
  fiberG: number;
  /** Расчёт упёрся в минимум безопасного уровня (1200 / 1500 ккал): показывается пометка. */
  floorApplied: boolean;
}

export type TargetsResult = Targets | { blocked: BlockReason };

/** Норма заблокирована: вместо цифр показывается «Обратитесь к врачу». */
export const isBlocked = (result: TargetsResult): result is { blocked: BlockReason } =>
  'blocked' in result;

const round = (value: number): number => Math.round(value);

export function calcTargets(input: TargetsInput): TargetsResult {
  if (input.hasCondition) return { blocked: 'medical_condition' };
  if (input.age < MIN_AGE || input.age > MAX_AGE) return { blocked: 'age_out_of_range' };

  const bmr =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + (input.sex === 'male' ? 5 : -161);
  const wanted = bmr * ACTIVITY_FACTOR[input.activity] * (1 + GOAL_ADJUSTMENT[input.goal]);
  const minimum = MIN_KCAL[input.sex];
  const floorApplied = round(wanted) < minimum;
  const kcal = floorApplied ? minimum : round(wanted);

  const proteinG = round(input.weightKg * PROTEIN_PER_KG[input.goal]);
  const fatG = round((kcal * FAT_SHARE) / 9);
  const carbG = Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4));

  return {
    kcal,
    proteinG,
    proteinRangeG: {
      min: round(input.weightKg * PROTEIN_RANGE_PER_KG.min),
      max: round(input.weightKg * PROTEIN_RANGE_PER_KG.max),
    },
    fatG,
    carbG,
    fiberG: round((kcal / 1000) * FIBER_PER_1000_KCAL),
    floorApplied,
  };
}
