// Эталонные значения посчитаны вручную (Миффлин-Сан Жеор), а не кодом под тестом.
// Правила округления: ккал, граммы — до целого, половина вверх; углеводы — остаток после округлённых белка и жиров.
import { describe, expect, it } from 'vitest';
import { calcTargets, type TargetsInput } from '@sportpit/shared/targets';

const base: TargetsInput = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goal: 'maintain',
  activity: 'moderate',
};

const OK = (overrides: Partial<TargetsInput> = {}) => calcTargets({ ...base, ...overrides });

interface Example {
  name: string;
  input: Partial<TargetsInput>;
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
  fiber: number;
}

// Разбор вручную в комментариях: БМ = 10·вес + 6,25·рост − 5·возраст + 5 (муж) / −161 (жен).
const EXAMPLES: Example[] = [
  {
    // БМ 800+1125−150+5=1780; ×1,55=2759; ×0,85=2345,15; белок 2,0×80; жиры 586,25/9=65,1; клетчатка 14×2,345=32,8
    name: 'мужчина, похудение, умеренная',
    input: { goal: 'lose', activity: 'moderate' },
    kcal: 2345,
    protein: 160,
    fat: 65,
    carb: 280,
    fiber: 33,
  },
  {
    // БМ 1780; ×1,2=2136; поддержание ×1; белок 1,6×80=128; жиры 534/9=59,3; (2136−512−531)/4=273,25
    name: 'мужчина, поддержание, сидячая',
    input: { goal: 'maintain', activity: 'sedentary' },
    kcal: 2136,
    protein: 128,
    fat: 59,
    carb: 273,
    fiber: 30,
  },
  {
    // БМ 700+1093,75−125+5=1673,75; ×1,725=2887,22; ×1,12=3233,69; белок 1,8×70=126; жиры 808,5/9=89,8; (3234−504−810)/4=480
    name: 'мужчина, набор, высокая',
    input: { age: 25, heightCm: 175, weightKg: 70, goal: 'gain', activity: 'active' },
    kcal: 3234,
    protein: 126,
    fat: 90,
    carb: 480,
    fiber: 45,
  },
  {
    // БМ 700+1050−175−161=1414; ×1,55=2191,7; ×0,85=1862,95; белок 140; жиры 465,75/9=51,75; (1863−560−468)/4=208,75
    name: 'женщина, похудение, умеренная',
    input: {
      sex: 'female',
      age: 35,
      heightCm: 168,
      weightKg: 70,
      goal: 'lose',
      activity: 'moderate',
    },
    kcal: 1863,
    protein: 140,
    fat: 52,
    carb: 209,
    fiber: 26,
  },
  {
    // БМ 650+1062,5−150−161=1401,5; ×1,725=2417,59; поддержание; белок 1,6×65=104; жиры 604,5/9=67,2; (2418−416−603)/4=349,75
    name: 'женщина, поддержание, высокая',
    input: {
      sex: 'female',
      age: 30,
      heightCm: 170,
      weightKg: 65,
      goal: 'maintain',
      activity: 'active',
    },
    kcal: 2418,
    protein: 104,
    fat: 67,
    carb: 350,
    fiber: 34,
  },
  {
    // БМ 1000+1125−250+5=1880; ×1,375=2585; ×0,85=2197,25; белок 200; жиры 549,25/9=61; (2197−800−549)/4=212
    name: 'мужчина, похудение, лёгкая',
    input: { age: 50, weightKg: 100, goal: 'lose', activity: 'light' },
    kcal: 2197,
    protein: 200,
    fat: 61,
    carb: 212,
    fiber: 31,
  },
];

describe('calcTargets: эталонные примеры', () => {
  it.each(EXAMPLES)('$name', ({ input, kcal, protein, fat, carb, fiber }) => {
    expect(OK(input)).toMatchObject({
      kcal,
      proteinG: protein,
      fatG: fat,
      carbG: carb,
      fiberG: fiber,
      floorApplied: false,
    });
  });

  it('показывает диапазон белка 1,6–2,2 г на кг массы тела', () => {
    expect(OK({ weightKg: 80 })).toMatchObject({ proteinRangeG: { min: 128, max: 176 } });
    expect(OK({ weightKg: 65, goal: 'lose' })).toMatchObject({
      proteinRangeG: { min: 104, max: 143 },
    });
  });

  it('белок по цели: 2,0 / 1,6 / 1,8 г на кг', () => {
    expect(OK({ goal: 'lose' })).toMatchObject({ proteinG: 160 });
    expect(OK({ goal: 'maintain' })).toMatchObject({ proteinG: 128 });
    expect(OK({ goal: 'gain' })).toMatchObject({ proteinG: 144 });
  });

  it('коэффициенты активности 1,2 / 1,375 / 1,55 / 1,725 при БМ 1800 (82 кг)', () => {
    // БМ 820+1125−150+5=1800
    expect(OK({ weightKg: 82, activity: 'sedentary' })).toMatchObject({ kcal: 2160 });
    expect(OK({ weightKg: 82, activity: 'light' })).toMatchObject({ kcal: 2475 });
    expect(OK({ weightKg: 82, activity: 'moderate' })).toMatchObject({ kcal: 2790 });
    expect(OK({ weightKg: 82, activity: 'active' })).toMatchObject({ kcal: 3105 });
  });
});

describe('calcTargets: граница возраста и состояния здоровья', () => {
  it.each([
    [17, true],
    [18, false],
    [80, false],
    [81, true],
  ])('возраст %i: блок = %s', (age, blocked) => {
    const result = OK({ age });
    if (blocked) expect(result).toEqual({ blocked: 'age_out_of_range' });
    else expect(result).not.toHaveProperty('blocked');
  });

  it('возраст 80: норма считается (женщина 155 см, 58 кг, лёгкая: 1358 ккал)', () => {
    // БМ 580+968,75−400−161=987,75; ×1,375=1358,16; белок 1,6×58=92,8→93; жиры 339,5/9=37,7→38; (1358−372−342)/4=161
    expect(
      OK({ sex: 'female', age: 80, heightCm: 155, weightKg: 58, activity: 'light' }),
    ).toMatchObject({
      kcal: 1358,
      proteinG: 93,
      fatG: 38,
      carbG: 161,
      fiberG: 19,
    });
  });

  it('флаг состояния блокирует расчёт при любом возрасте', () => {
    expect(OK({ hasCondition: true })).toEqual({ blocked: 'medical_condition' });
    expect(OK({ hasCondition: true, age: 16 })).toEqual({ blocked: 'medical_condition' });
  });

  it('без флага состояния расчёт идёт', () => {
    expect(OK({ hasCondition: false })).not.toHaveProperty('blocked');
  });
});

describe('calcTargets: минимум безопасного уровня', () => {
  it('женщина не ниже 1200 ккал, отмечено floorApplied', () => {
    // БМ 500+1000−200−161=1139; ×1,2=1366,8; ×0,85=1161,78 → 1200; белок 100; жиры 300/9=33; (1200−400−297)/4=125,75
    expect(
      OK({
        sex: 'female',
        age: 40,
        heightCm: 160,
        weightKg: 50,
        goal: 'lose',
        activity: 'sedentary',
      }),
    ).toMatchObject({
      kcal: 1200,
      floorApplied: true,
      proteinG: 100,
      fatG: 33,
      carbG: 126,
      fiberG: 17,
    });
  });

  it('мужчина не ниже 1500 ккал', () => {
    // БМ 600+1062,5−225+5=1442,5; ×1,2=1731; ×0,85=1471,35 → 1500; белок 120; жиры 375/9=41,7→42; (1500−480−378)/4=160,5→161 (половина вверх)
    expect(
      OK({ age: 45, heightCm: 170, weightKg: 60, goal: 'lose', activity: 'sedentary' }),
    ).toMatchObject({
      kcal: 1500,
      floorApplied: true,
      proteinG: 120,
      fatG: 42,
      carbG: 161,
      fiberG: 21,
    });
  });

  it('норма выше минимума отмечается без пометки', () => {
    expect(
      OK({ sex: 'female', age: 30, heightCm: 170, weightKg: 65, activity: 'active' }),
    ).toMatchObject({
      floorApplied: false,
    });
  });
});
