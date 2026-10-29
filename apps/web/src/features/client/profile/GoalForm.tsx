import { useId, useState, type FormEvent } from 'react';
import {
  PROFILE_LIMITS,
  type ProfileDto,
  type ProfileInput,
} from '@sportpit/shared/schemas/profile';
import { ACTIVITY_LEVELS, GOALS, SEXES } from '@sportpit/shared/targets';
import { useT } from '../../../app/i18n.tsx';
import { Button, TextField } from '../../../ui/index.ts';
import './profile.css';

type NumberField = 'age' | 'height' | 'weight';
type Errors = Partial<Record<NumberField | 'sex' | 'goal' | 'activity', string>>;

interface FormState {
  sex: string;
  age: string;
  height: string;
  weight: string;
  goal: string;
  activity: string;
  hasCondition: boolean;
}

const fromProfile = (p?: ProfileDto | null): FormState => ({
  sex: p?.sex ?? '',
  age: p ? String(p.age) : '',
  height: p ? String(p.heightCm) : '',
  weight: p ? String(p.weightKg) : '',
  goal: p?.goal ?? '',
  activity: p?.activity ?? '',
  hasCondition: p?.hasCondition ?? false,
});

const parseNumber = (text: string): number => Number(text.trim().replace(',', '.'));

export interface GoalFormProps {
  initial?: ProfileDto | null;
  busy?: boolean;
  /** Вызывается только с проверенными значениями. */
  onSubmit: (input: Required<ProfileInput>) => void;
}

/** Анкета цели: шесть полей и отметка о состоянии здоровья (R16). Проверка границ — на сервере тоже. */
export function GoalForm({ initial, busy = false, onSubmit }: GoalFormProps) {
  const t = useT();
  const baseId = useId();
  const [state, setState] = useState<FormState>(() => fromProfile(initial));
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  function validate(): Errors {
    const found: Errors = {};
    const check = (
      field: NumberField,
      text: string,
      limits: { min: number; max: number },
      integer: boolean,
    ) => {
      if (text.trim() === '') found[field] = t('profile.form.error.required');
      else {
        const value = parseNumber(text);
        if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
          found[field] = t('profile.form.error.range', limits);
        } else if (integer && !Number.isInteger(value)) {
          found[field] = t('profile.form.error.integer');
        }
      }
    };
    if (!state.sex) found.sex = t('profile.form.error.required');
    check('age', state.age, PROFILE_LIMITS.age, true);
    check('height', state.height, PROFILE_LIMITS.heightCm, true);
    check('weight', state.weight, PROFILE_LIMITS.weightKg, false);
    if (!state.goal) found.goal = t('profile.form.error.required');
    if (!state.activity) found.activity = t('profile.form.error.required');
    return found;
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit({
      sex: state.sex as (typeof SEXES)[number],
      age: parseNumber(state.age),
      heightCm: parseNumber(state.height),
      weightKg: parseNumber(state.weight),
      goal: state.goal as (typeof GOALS)[number],
      activity: state.activity as (typeof ACTIVITY_LEVELS)[number],
      hasCondition: state.hasCondition,
    });
  }

  const selectField = (name: 'goal' | 'activity', values: readonly string[]) => {
    const id = `${baseId}-${name}`;
    return (
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={id}>
          {t(`profile.form.${name}`)}
        </label>
        <select
          id={id}
          className="ui-field__input"
          value={state[name]}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={errors[name] ? `${id}-error` : undefined}
          onChange={(e) => set(name, e.target.value)}
        >
          <option value="">{t('profile.form.select')}</option>
          {values.map((value) => (
            <option key={value} value={value}>
              {t(`profile.form.${name}.${value}`)}
            </option>
          ))}
        </select>
        {errors[name] ? (
          <p className="goal-form__field-error" id={`${id}-error`} role="alert">
            {errors[name]}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form className="goal-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend>{t('profile.form.sex')}</legend>
        {SEXES.map((value) => (
          <label key={value} className="goal-form__choice">
            <input
              type="radio"
              name={`${baseId}-sex`}
              value={value}
              checked={state.sex === value}
              onChange={() => set('sex', value)}
            />
            <span>{t(`profile.form.sex.${value}`)}</span>
          </label>
        ))}
        {errors.sex ? (
          <p className="goal-form__field-error" role="alert">
            {errors.sex}
          </p>
        ) : null}
      </fieldset>
      <TextField
        label={t('profile.form.age')}
        inputMode="numeric"
        value={state.age}
        onChange={(e) => set('age', e.target.value)}
        error={errors.age}
      />
      <TextField
        label={t('profile.form.height')}
        inputMode="numeric"
        value={state.height}
        onChange={(e) => set('height', e.target.value)}
        error={errors.height}
      />
      <TextField
        label={t('profile.form.weight')}
        inputMode="decimal"
        value={state.weight}
        onChange={(e) => set('weight', e.target.value)}
        error={errors.weight}
      />
      {selectField('goal', GOALS)}
      {selectField('activity', ACTIVITY_LEVELS)}
      <label className="goal-form__choice">
        <input
          type="checkbox"
          checked={state.hasCondition}
          onChange={(e) => set('hasCondition', e.target.checked)}
        />
        <span>{t('profile.form.condition')}</span>
      </label>
      <Button type="submit" fullWidth loading={busy}>
        {t('profile.form.submit')}
      </Button>
    </form>
  );
}
